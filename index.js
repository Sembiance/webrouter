"use strict";

var base = require("xbase"),
	tiptoe = require("tiptoe"),
	http = require("http"),
	path = require("path"),
	url = require("url"),
	zlib = require("zlib"),
	dustUtil = require("xutil").dust;

var WebRouter = function()
{
	this.routes = {};

	WebRouter.prototype.requestHandler = function(request, response)
	{
		if(request.method!=="GET")
		{
			response.writeHead(501, { "Content-Type" : "text/plain" });
			return response.end("Method [" + request.method + "] is not supported.");
		}

		var target = url.parse(request.url);
		if(!this.routes.hasOwnProperty(target.pathname))
		{
			response.writeHead(404, { "Content-Type" : "text/plain" });
			return response.end();
		}

		var responseHeaders =
		{
			"Date"          : new Date().toUTCString(),
			"Cache-Control" : "no-cache, no-store",
			"Vary"          : "Accept-Encoding",
			"Expires"       : "Thu, 01 Jan 1970 00:00:01 GMT"
		};

		// Check to see if we allow gzip
		var acceptEncoding = request.headers["accept-encoding"];
		var gzip = false;
		if(acceptEncoding && acceptEncoding.split(",").map(function(encoding) { return encoding.trim().toLowerCase(); }).contains("gzip"))
			gzip = true;

		if(gzip)
			responseHeaders["Content-Encoding"] = "gzip";

		var route = this.routes[target.pathname];
		responseHeaders["Content-Type"] = route.getContentType();

		tiptoe(
			function render()
			{
				route.render(request, this);
			},
			function compressIfNeeded(data)
			{
				if(gzip)
					zlib.gzip(data, this);
				else
					this(undefined, data);
			},
			function issueResponse(err, data)
			{
				if(err)
				{
					response.writeHead(500, { "Content-Type" : "text/plain" });
					return response.end(err.toString());
				}

				response.writeHead(200, responseHeaders);
				response.end(data);
			}
		);
	};

	WebRouter.prototype.addRoute = function(paths, route)
	{
		Array.toArray(paths).forEach(function(path)
		{
			this.routes[path] = route;
		}.bind(this));
	};

	WebRouter.prototype.addDustRoute = function(paths, dustPath, dustName, dustData)
	{
		this.addRoute(paths, new DustRoute(dustPath, dustName, dustData));
	};

	WebRouter.prototype.addJSONRoute = function(paths, handler)
	{
		this.addRoute(paths, new JSONRoute(handler));
	};

	WebRouter.prototype.listen = function(port, host)
	{
		this.app = http.createServer(this.requestHandler.bind(this));
		this.app.listen(port, host);
	};
};

var JSONRoute = function(_handler)
{
	this.handler = _handler;

	JSONRoute.prototype.render = function(request, cb)
	{
		return setImmediate(function() { cb(undefined, JSON.stringify(this.handler(request))); }.bind(this));
	};

	JSONRoute.prototype.getContentType = function()
	{
		return "text/plain;charset=utf-8";
	};
};

var DustRoute = function(_dustPath, _dustName, _dustData)
{
	this.dustPath = _dustPath;
	this.dustName = _dustName;
	this.dustData = _dustData;

	DustRoute.prototype.render = function(request, cb)
	{
		dustUtil.render(this.dustPath, this.dustName,  (typeof this.dustData==="function" ? this.dustData() : this.dustData), cb);
	};

	DustRoute.prototype.getContentType = function()
	{
		return "text/html;charset=utf-8";
	};
};

exports.createRouter = function()
{
	return new WebRouter();
};
