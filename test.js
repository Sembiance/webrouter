"use strict";

const base = require("@sembiance/xbase"),
	{ WebRouter } = require("./index.js");

const router = new WebRouter({disableCache : true});
router.addDustRoute("GET", ["/", "/index.html"], __dirname, "test", (request, cb) => cb(undefined, {name : "Roberto"}));
router.addJSONRoute("get", "/testjson", (req, cb) => cb(undefined, {abc : 123}));
router.listen(46728, "127.0.0.1");

console.log("Tests:");
console.log("\thttp://127.0.0.1:46728");
console.log("\thttp://127.0.0.1:46728/testjson");
