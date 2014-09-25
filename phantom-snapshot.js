var phantomjs = require('phantomjs')
  , path = require('path')
  , childProcess = require('child_process')
  , fs = require('fs')
  , Q = require('q')
  , _ = require('underscore')

  logEnabled = false;


var phantomSnapshot = function(options) {

  phantomSnapshot.options = _.defaults(options || {}, {
      verbose:        false
    , cleanOnStart:   false
    , dir:            './snapshots'
    , maxAge:         1000 * 60 * 2
    , scriptPath:     path.join(__dirname, 'phantom-script.js')
    , screenshot:     false
    , viewportWidth:  null
    , viewportHeight: null
  });

  logEnabled = (typeof(console) != 'undefined' && phantomSnapshot.options.verbose);

  console.log('phantomSnapshot initialized');

  logMsg('options:\n >',
      _.chain(phantomSnapshot.options)
        .pairs()
        .collect(function(pair) {
          return  pair[0] + " : " + pair[1];
        })
        .value()
        .join("\n > ")
  );

  if (phantomSnapshot.options.cleanOnStart) phantomSnapshot.clean();


  return function(req, resp, next) {
    var snapshotMatch = req.url.match(/^\/snapshot(\/.*)/)
      , snapshotDomain = req.protocol + '://' + req.headers.host;

    if (snapshotMatch) {
      phantomSnapshot.snapRequest(snapshotDomain, snapshotMatch[1], req, resp, next);

    } else if (typeof(req.query._escaped_fragment_) != 'undefined') {
      phantomSnapshot.getSnapshot(snapshotDomain, phantomSnapshot.stripFragment(req.url)).then(function(file_path) {
        // TODO: Set headers for caching this response?
        resp.sendFile(file_path).end();
      }, function(err) {
        next();
      });

    } else {
      next();

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

  logMsg('snap: - ' + cmd);

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

phantomSnapshot.clean = function() {
  deleteFolderRecursive(phantomSnapshot.options.dir);
};


module.exports = phantomSnapshot;


function logMsg() {
  var args = Array.prototype.slice.call(arguments, 0);
  args.unshift('phantomSnapshot: ');
  if (logEnabled) console.log.apply(this, args);
}

function logErr() {
  var args = Array.prototype.slice.call(arguments, 0);
  args.unshift('phantomSnapshot: ');
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

