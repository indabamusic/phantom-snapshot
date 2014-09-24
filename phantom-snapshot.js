var phantomjs = require('phantomjs')
  , path = require('path')
  , childProcess = require('child_process')
  , fs = require('fs')
  , Q = require('q');


var phantomSnapshot = function(options) {

  phantomSnapshot.options = options || {};

  phantomSnapshot.options.dir        = phantomSnapshot.options.dir || './snapshots';
  phantomSnapshot.options.scriptPath = phantomSnapshot.options.scriptPath || path.join(__dirname, 'phantom-script.js');

  return function(req, resp, next) {
    var snapshotMatch = req.url.match(/^\/snapshot(\/.*)/)
      , snapshotDomain = req.protocol + '://' + req.headers.host;

    if (snapshotMatch) {
      phantomSnapshot.snapRequest(snapshotDomain, snapshotMatch[1], req, resp, next);

    } else if (typeof(req.query._escaped_fragment_) != 'undefined') {
      phantomSnapshot.getSnapshot(snapshotDomain, phantomSnapshot.stripFragment(req.url)).then(function(file_path) {
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
    console.log('Snapshot Success ' + file_path);
    resp.redirect(301, page_path);
  }, function(err) {
    console.error('Snapshot Failure - ' + err);
    resp.redirect(301, page_path);
  });
};

phantomSnapshot.getSnapshot = function(page_domain, page_path, create_new) {
  var deferred = Q.defer();

  var file_path = phantomSnapshot.options.dir + '/' + phantomSnapshot.getFileName(page_path);

  fs.exists(file_path, function(exists) {
    if (exists) {
      deferred.resolve(file_path);
    } else {
      phantomSnapshot.snap(page_domain, page_path).then(function(file_path) {
        deferred.resolve(file_path);
      }, function(err) {
        deferred.reject(err);
      });
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
    phantomSnapshot.getFileName(page_path)
  ].join(' ');

  childProcess.exec(cmd, {}, function(err, stdout, stderr) {
    if (stdout) console.log(stdout);
    if (stderr) console.error(stderr);

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


module.exports = phantomSnapshot;
