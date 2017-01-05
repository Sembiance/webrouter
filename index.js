"use strict";

var base = require("@sembiance/xbase"),
	tiptoe = require("tiptoe"),
	http = require("http"),
	url = require("url"),
	cookie = require("cookie"),
	zlib = require("zlib"),
	dustUtil = require("@sembiance/xutil").dust;

var WebRouter = function(_options)
{
	this.routes = {GET:{},POST:{},PUT:{}};
	this.options = _options || {};

	WebRouter.prototype.requestHandler = function(request, response)
	{
		var method = request.method.toUpperCase();
		if(!this.routes.hasOwnProperty(method))
		{
			response.writeHead(501, { "Content-Type" : "text/plain" });
			return response.end("Method [" + request.method + "] is not supported.");
		}

		var target = url.parse(request.url);
		if(!this.routes[method].hasOwnProperty(target.pathname))
		{
			response.writeHead(404, { "Content-Type" : "text/plain" });
			return response.end();
		}

		request.cookieData = {};
		if(request.headers && request.headers.cookie)
			request.cookieData = cookie.parse(request.headers.cookie);

		var responseHeaders =
		{
			"Date"          : new Date().toUTCString(),
			"Cache-Control" : "no-cache, no-store",
			"Vary"          : "Accept-Encoding",
			"Expires"       : "Thu, 01 Jan 1970 00:00:01 GMT"
		};

		var route = this.routes[method][target.pathname];
		responseHeaders["Content-Type"] = route.getContentType();

		if(request.method==="POST" || request.method==="PUT")
		{
			var postData = "";
			request.on("data", function(chunk) { postData += chunk; });
			request.on("end", function() { request.postData = postData; setImmediate(finishRequest); });
		}
		else
		{
			setImmediate(finishRequest);
		}

		function finishRequest()
		{
			tiptoe(
				function render()
				{
					route.render(request, this);
				},
				function compressIfNeeded(data, meta)
				{
					if(meta)
					{
						if(meta.cookies)
						{
							if(!responseHeaders.hasOwnProperty("Set-Cookie"))
								responseHeaders["Set-Cookie"] = [];
							meta.cookies.forEach(function(c)
							{
								responseHeaders["Set-Cookie"].push(cookie.serialize(c.name, c.value, c));
							});
						}

						// TODO: support meta.headers for adding/removing custom responseHeaders
					}
					
					if(data && data.length>0 && request.headers["accept-encoding"] && request.headers["accept-encoding"].split(",").some(function(encoding) { return encoding.trim().toLowerCase()==="gzip"; }))
					{
						responseHeaders["Content-Encoding"] = "gzip";
						zlib.gzip(data, this);
					}
					else
					{
						this(undefined, data);
					}
				},
				function issueResponse(err, data)
				{
					if(err)
					{
						base.error(err);
						response.writeHead(500, { "Content-Type" : "text/plain" });
						return response.end(err.stack || err.toString());
					}

					response.writeHead(200, responseHeaders);
					response.end(data);
				}
			);
		}
	};

	WebRouter.prototype.addRoute = function(methods, paths, route)
	{
		Array.toArray(paths).forEach(function(path)
		{
			Array.toArray(methods).forEach(function(method)
			{
				if(!this.routes.hasOwnProperty(method.toUpperCase()))
					return;

				this.routes[method.toUpperCase()][path] = route;
			}.bind(this));
		}.bind(this));
	};

	WebRouter.prototype.addDustRoute = function(methods, paths, dustPath, dustName, dustData)
	{
		this.addRoute(methods, paths, new DustRoute(dustPath, dustName, dustData, this.options));
	};

	WebRouter.prototype.addJSONRoute = function(methods, paths, handler)
	{
		this.addRoute(methods, paths, new JSONRoute(handler, this.options));
	};

	WebRouter.prototype.addTextRoute = function(methods, paths, handler)
	{
		this.addRoute(methods, paths, new TextRoute(handler, this.options));
	};

	WebRouter.prototype.listen = function(port, host, timeout)
	{
		this.server = http.createServer(this.requestHandler.bind(this));
		if(typeof timeout!=="undefined")
			this.server.timeout = timeout;
		this.server.listen(port, host);
	};
};

var TextRoute = function(_handler, _options)
{
	this.handler = _handler;
	this.options = _options;

	TextRoute.prototype.render = function(request, cb)
	{
		this.handler(request, cb);
	};

	TextRoute.prototype.getContentType = function()
	{
		return "text/plain;charset=utf-8";
	};
};

var JSONRoute = function(_handler, _options)
{
	this.handler = _handler;
	this.options = _options;

	JSONRoute.prototype.render = function(request, cb)
	{
		this.handler(request, function(err, data, meta) { cb(err, JSON.stringify(data), meta); });
	};

	JSONRoute.prototype.getContentType = function()
	{
		return "application/json;charset=utf-8";
	};
};

var DustRoute = function(_dustPath, _dustName, _dustData, _options)
{
	this.dustPath = _dustPath;
	this.dustName = _dustName;
	this.dustData = _dustData;
	this.options = _options;

	DustRoute.prototype.render = function(request, cb)
	{
		dustUtil.render(this.dustPath, this.dustName,  (typeof this.dustData==="function" ? this.dustData() : this.dustData), this.options, cb);
	};

	DustRoute.prototype.getContentType = function()
	{
		return "text/html;charset=utf-8";
	};
};

exports.createRouter = function(options)
{
	return new WebRouter(options);
};
