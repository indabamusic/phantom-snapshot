var phantomjs = require('phantomjs')
  , path = require('path')
  , childProcess = require('child_process')
  , fs = require('fs')
  , Q = require('q')
  , _ = require('underscore')

  , logEnabled = false
  , logPrefix = 'Phantom Snapshot: '

  , userAgent = 'PhantomJS';


var phantomSnapshot = function(options) {

  phantomSnapshot.options = _.defaults(options || {}, {
      verbose:        false
    , ignore:         [/\.(?!html$).*$/i]
    , cleanOnStart:   false
    , createOnCrawl:  true
    , createOnView:   false
    , dir:            './snapshots'
    , maxAge:         1000 * 60 * 2
    , scriptPath:     path.join(__dirname, 'phantom-script.js')
    , screenshot:     false
    , viewportWidth:  null
    , viewportHeight: null
  });

  logEnabled = (typeof(console) != 'undefined' && phantomSnapshot.options.verbose);

  console.log(logPrefix, 'initialized');

  logMsg('options:\n >',
      _.chain(phantomSnapshot.options)
        .pairs()
        .collect(function(pair) {
          return  pair[0] + " : " + pair[1];
        })
        .value()
        .join("\n > "));


  if (phantomSnapshot.options.cleanOnStart) phantomSnapshot.clean();


  return function(req, resp, next) {
    if (req.headers && req.headers['user-agent'] && req.headers['user-agent'] == userAgent) return next();
    if (!req.accepts('html')) return next();

    if (phantomSnapshot.options.ignore) {
      for (var i = 0; i < phantomSnapshot.options.ignore.length; i++) {
        if (req.url.match(phantomSnapshot.options.ignore[i])) {
          return next();
        }
      }
    }

    logMsg('on request - ' + req.url);

    var snapshotMatch = req.url.match(/^\/snapshot(\/.*)/)
      , snapshotDomain = req.protocol + '://' + req.headers.host;

    if (snapshotMatch) {
      phantomSnapshot.snapRequest(snapshotDomain, snapshotMatch[1], req, resp, next);

    } else if (phantomSnapshot.options.createOnCrawl && phantomSnapshot.isCrawler(req)) {
      phantomSnapshot.getSnapshot(snapshotDomain, phantomSnapshot.stripFragment(req.url)).then(function(file_path) {
        // TODO: Set headers for caching this response?
        return resp.sendFile(file_path).end();
      }, function(err) {
        return next();
      });

    } else {
      if (phantomSnapshot.options.createOnView) {
        phantomSnapshot.getSnapshot(snapshotDomain, phantomSnapshot.stripFragment(req.url))
      }
      return next();

    }
  }

};
  
phantomSnapshot.snapRequest = function(page_domain, page_path, req, resp, next) {
  phantomSnapshot.snap(page_domain, page_path).then(function(file_path) {
    logMsg('snapRequest: snapshot success ' + file_path);
    resp.redirect(301, page_path);
  }, function(err) {
    logErr('snapRequest: snapshot failure - ' + err);
    resp.redirect(301, page_path);
  });
};

phantomSnapshot.getSnapshot = function(page_domain, page_path, create_new) {
  var deferred = Q.defer();

  var file_path = phantomSnapshot.options.dir + '/' + phantomSnapshot.getFileName(page_path);

  var now = Date.now();

  fs.stat(file_path, function(err, stat) {
    var expiresAt = stat ? (stat.mtime.getTime() + phantomSnapshot.options.maxAge) : now;
    // if file does not exist, or if file is older than maxAge
    if ((err && err.code === 'ENOENT') || (now >= expiresAt)) {
      if (err && err.code === 'ENOENT') {
        logMsg('getSnapshot: file doesnt exist - ' + file_path);
      } else {
        logMsg('getSnapshot: file expired '+((now - expiresAt)/1000)+'s ago - ' + file_path);
      }
      phantomSnapshot.snap(page_domain, page_path).then(function(file_path) {
        logMsg('getSnapshot: snap success - ' + file_path);
        deferred.resolve(file_path);
      }, function(err) {
        logErr('getSnapshot: snap failure - ' + err);
        deferred.reject(err);
      });
    } else {
      logMsg('getSnapshot: still good for '+((expiresAt - now)/1000)+'s - ' + file_path);
      deferred.resolve(file_path);
    }
  });

  return deferred.promise;
};

phantomSnapshot.snap = function(page_domain, page_path) {
  var deferred = Q.defer();

  var cmd = [
    phantomjs.path,
    '--disk-cache=no',
    '--ignore-ssl-errors=yes',
    phantomSnapshot.options.scriptPath,
    page_domain + page_path,
    phantomSnapshot.options.dir,
    phantomSnapshot.getFileName(page_path),
    (function(){
      var scr = "";
      if (phantomSnapshot.options.screenshot) {
        scr += "screenshot";
        if (phantomSnapshot.options.viewportWidth && phantomSnapshot.options.viewportHeight) {
          scr += ("=" + phantomSnapshot.options.viewportWidth + "_" + phantomSnapshot.options.viewportHeight);
        }
      }
      return scr;
    }())
  ].join(' ');

  logMsg('snap: command - ' + cmd);

  childProcess.exec(cmd, {}, function(err, stdout, stderr) {
    if (err) {
      deferred.reject(err);
    } else {
      deferred.resolve(stdout.replace(/\r|\n|\s|\t/g,''));
    }
  });

  return deferred.promise;
};

phantomSnapshot.stripFragment = function(page_path) {
  page_path = page_path.replace(/_escaped_fragment_[^&]*[&]?/, '');
  page_path = page_path.replace(/\?$/,'');
  return page_path;
};

phantomSnapshot.getFileName = function(page_path) {
  page_path = page_path.replace(/[:\/-]+/g,'_');
  page_path = page_path.replace(/^_/,'');
  page_path = ((page_path || 'index') + '.html');
  return page_path;
};

phantomSnapshot.isCrawler = function(req) {
  return typeof(req.query._escaped_fragment_) != 'undefined'                            // search engine
      || (typeof(req.headers['user-agent']) === 'string'
          && ~req.headers['user-agent'].toLowerCase().indexOf('facebookexternalhit'));  // facebook crawler
};

phantomSnapshot.clean = function() {
  deleteFolderRecursive(phantomSnapshot.options.dir);
};


module.exports = phantomSnapshot;


function logMsg() {
  var args = Array.prototype.slice.call(arguments, 0);
  args.unshift(logPrefix);
  if (logEnabled) console.log.apply(this, args);
}

function logErr() {
  var args = Array.prototype.slice.call(arguments, 0);
  args.unshift(logPrefix);
  if (logEnabled) console.error.apply(this, args);
}


function deleteFolderRecursive(path) {
  var files = [];
  if( fs.existsSync(path) ) {
      files = fs.readdirSync(path);
      files.forEach(function(file,index){
          var curPath = path + "/" + file;
          if(fs.lstatSync(curPath).isDirectory()) { // recurse
              deleteFolderRecursive(curPath);
          } else { // delete file
              fs.unlinkSync(curPath);
          }
      });
      fs.rmdirSync(path);
  }
}

