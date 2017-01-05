"use strict";

var base = require("@sembiance/xbase"),
	webrouter = require("./index.js");

var router = webrouter.createRouter();
router.addDustRoute("GET", ["/", "/index.html"], __dirname, "test", function() { return {name : "Roberto"}; });
router.addJSONRoute("get", "/testjson", function(req, cb) { return cb(undefined, {abc:123}); });
router.listen(46728, "127.0.0.1");
console.log("Listening on http://127.0.0.1:46728");