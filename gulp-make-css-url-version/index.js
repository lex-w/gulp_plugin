
var path = require('path');
var crypto = require('crypto');
var fs = require('fs');

var gutil = require('gulp-util');
var through = require('through2');
var Q = require('q');

var PLUGIN_NAME = 'gulp-make-css-url-version';

var getMD5 = function (data) {
    var hash = crypto.createHash("md5");
    hash.update(data);
    var md5Base64 = hash.digest("base64");
    return md5Base64;
};

var formatDate = function (format, date) {
    date = date || new Date();
    var o = {
        "M+": date.getMonth() + 1,
        "d+": date.getDate(),
        "h+": date.getHours(),
        "m+": date.getMinutes(),
        "s+": date.getSeconds(),
        "q+": Math.floor((date.getMonth() + 3) / 3),
        "S": date.getMilliseconds()
    };
    format = format.replace(/y{4}/, date.getFullYear()).replace(/y{2}/, date.getFullYear().toString().substring(2));

    for (var k in o) {
        var reg = new RegExp(k);
        format = format.replace(reg, match);
    }
    function match(m) {
        return m.length == 1 ? o[k] : ("00" + o[k]).substr(("" + o[k]).length);
    }
    return format;
};

module.exports = function (options) {
    return through.obj(function (file, enc, cb) {
        options = options || {};
        var self = this;

        if (file.isNull()) {
            this.push(file);
            return cb();
        }

        if (file.isStream()) {
            this.emit('error', new gutil.PluginError(PLUGIN_NAME, 'Streaming not supported'));
            return cb();
        }

        //html file only
        if (!/^\.css?$/.test(path.extname(file.path))) {
            this.emit('error', new gutil.PluginError(PLUGIN_NAME, 'support css file only'));
            return cb();
        }

        var html = file.contents.toString();

        var promises = [];

        html = html.replace(/url\("?([^\)"]+)"?\)/g, function (str, url) {

            url = url.replace(/\?[\s\S]*$/, "").trim();

            if (url.indexOf("base64,") > -1 || url.indexOf("http://") > -1 || url.indexOf("/") == 0) {
                return str;
            }

            var format = options.format || "yyyy-MM-dd";

            //use date as the version
            if (options.useDate) {
                return "url(" + url + "?v=" + formatDate(format, Date.now()) + ")";
            }

            //use md5
            var imageFilePath = path.resolve(path.dirname(file.path), url);

            var tempKey = Math.random().toString();
            var readFile = Q.denodeify(fs.readFile);

            var promise = readFile(imageFilePath)
                .then(function (data) {
                    gutil.log('replacing image ' + imageFilePath + ' version in css file: ' + file.path);
                    return {
                        key: tempKey,
                        value: "url(" + url + "?v=" + encodeURIComponent(getMD5(data.toString())) + ")"
                    };
                }, function (e) {
                    return {
                        key: tempKey,
                        value: "url(" + url + "?v=" + formatDate(format, Date.now())
                    };
                });

            promises.push(promise);

            return tempKey;
        });

        if (options.useDate) {
            file.contents = new Buffer(html);
            self.push(file);
            cb();
            return;
        }

        Q.all(promises).then(function (mathces) {

            mathces.forEach(function (match) {
                html = html.replace(match.key, match.value);
            });

            file.contents = new Buffer(html);
            self.push(file);
            cb();
        });

    });
};
