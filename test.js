"use strict";

var base = require("xbase"),
	webRouter = require("./index.js");

var router = webRouter.createRouter();
router.addDustRoute(["/", "/index.html"], __dirname, "test", function() { return {name : "Roberto"}; });
router.addJSONRoute("/testjson", function() { return {abc:123}; });
router.listen(46728, "127.0.0.1");
