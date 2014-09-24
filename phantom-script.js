var page = require('webpage').create()
  , system = require('system')
  , fs = require('fs')
  , t = Date.now();


if (system.args.length < 3) {
  throw new Error('Usage: phantom.js <some URL> <output directory> <output file name>');
  phantom.exit(0);
}


var url = system.args[1]
  , dir = system.args[2] || 'snapshots'
  , out = system.args[3];


page.settings.userAgent = 'PhantomJS';
page.settings.loadImages = false;
page.settings.localToRemoteUrlAccessEnabled = true;


function parseURL(page_url) {
  var url_parts = page_url.match(/^([A-z0-9]+:\/\/[^\/]+)(.*)$/i);

  return {
    url:    url_parts[0],
    domain: url_parts[1],
    path:   url_parts[2],
    file:   (function(page_path){
      page_path = page_path.replace(/[:\/-]+/g,'_');
      page_path = page_path.replace(/^_/,'');
      page_path = ((page_path || 'index') + '.html');
      return page_path;
    }(url_parts[2]))
  }
}

page.open(url, function(status) {
  if (status !== 'success') {
    throw new Error('Unable to access network');
    phantom.exit(0);
  } else {

    var parsedURL = parseURL(url);

    var title = page.evaluate(function() {
      return document.title;
    });

    var content = page.evaluate(function (d) {
      document.getElementById('App').style.visibility = 'visible';

      var baseTag = document.createElement('base');
          baseTag.href = d;

      document.getElementsByTagName('head')[0].appendChild(baseTag);

      var links = document.getElementsByTagName('link');
      if (links) {
        for (var i=0; i < links.length; i++) {
          var href = links[i].href;
              href = href.replace(/file:\/\/\//, d + '/');
          links[i].href = href;
        }
      }

      var scripts = document.getElementsByTagName('script');
      if (scripts) {
        for (i=0; i < scripts.length; i++) {
          // var src = scripts[i].src;
          //     src = src.replace(/file:\/\/\//, d + '/');
          scripts[i].src = ''; // src;
        }
      }

      return document.getElementsByTagName('html')[0].outerHTML;
    }, parsedURL.domain);

    setTimeout(function() {
      var file = dir + '/' + parsedURL.file;
      if (fs.exists(file)) fs.remove(file);
      fs.write(file, content, 'w');
      console.log(file);
      phantom.exit(file);
    }, 3000);
  }
});
