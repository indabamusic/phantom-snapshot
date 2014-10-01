var page = require('webpage').create()
  , system = require('system')
  , fs = require('fs')
  , t = Date.now()
  , ua = 'PhantomJS';


console.error = function () {
  system.stderr.write(Array.prototype.join.call(arguments, ' ') + '\n');
};

if (system.args.length < 3) {
  console.error('Usage: phantom.js <some URL> <output directory> <output file name> <screenshot[="width"x"height"]>');
  phantom.exit();
}


var url = system.args[1]
  , dir = system.args[2] || 'snapshots'
  , out = system.args[3]
  , scr = system.args[4]

  , viewportWidth = 1024
  , viewportHeight = 768;


if (scr && scr.match(/^screenshot/)) {
  var scrMatch = scr.match(/^screenshot=([0-9]+)_([0-9]+)/);
  if (scrMatch) {
    viewportWidth = scrMatch[1];
    viewportHeight = scrMatch[2];
  }
  scr = true;
} else {
  scr = false;
}

page.viewportSize = { width: viewportWidth, height: viewportHeight };

page.settings.userAgent = ua;
page.settings.loadImages = true;
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
      page_path = (page_path || 'index');
      return page_path;
    }(url_parts[2]))
  }
}

page.open(url, function(status) {
  if (status !== 'success') {
    console.error('Unable to access network');
    phantom.exit(0);
  } else {

    console.error('this is an error');

    var parsedURL = parseURL(url)
      , html_file = dir + '/' + parsedURL.file + '.html'
      , img_file = dir + '/' + parsedURL.file + '.png';

    fs.makeDirectory(dir);
    fs.touch(html_file);

    var title = page.evaluate(function() {
      return document.title;
    });
    
    inject_js("if (window) {" +
              "  if (typeof window.prePhantom === 'function') {" +
              "    window.prePhantom({" +
              "        width: '" + viewportWidth + "px'" +
              "      , height: '" + viewportHeight + "px'" +
              "    });" +
              "  }" +
              "}");

    var content = page.evaluate(function (d) {
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
          if (scripts[i].src) {
            var src = scripts[i].src;
                src = src.replace(/file:\/\/\//, d + '/');
            if (src) scripts[i].src = src;
          }
        }
      }

      return document.getElementsByTagName('html')[0].outerHTML;
    }, parsedURL.domain);

    setTimeout(function() {
      if (fs.exists(html_file)) fs.remove(html_file);
      if (fs.exists(img_file)) fs.remove(img_file);

      fs.write(html_file, content, 'w');

      if (scr) page.render(img_file, { format: "png" });

      console.log(html_file);
      phantom.exit(html_file);
    }, 3000);
  }
});

function inject_js(js) {
  page.evaluate(function(js_code) {
    var js_block = document.createElement('script');
        js_block.type = 'text/javascript';
        js_block.innerHTML = js_code;
    document.getElementsByTagName('body')[0].appendChild(js_block);
  }, js);
}
