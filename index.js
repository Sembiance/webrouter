"use strict";

const base = require("@sembiance/xbase"),
	tiptoe = require("tiptoe"),
	http = require("http"),
	url = require("url"),
	cookie = require("cookie"),
	zlib = require("zlib"),
	dustUtil = require("@sembiance/xutil").dust;

class TextRoute
{
	constructor(handler, options)
	{
		this.handler = handler;
		this.options = options;
	}

	render(request, cb)
	{
		this.handler(request, cb);
	}

	getContentType()
	{
		return "text/plain;charset=utf-8";
	}
}

class JSONRoute
{
	constructor(handler, options)
	{
		this.handler = handler;
		this.options = options;
	}

	render(request, cb)
	{
		this.handler(request, (err, data, meta) => cb(err, JSON.stringify(data), meta));
	}

	getContentType()
	{
		return "application/json;charset=utf-8";
	}
}

class DustRoute
{
	constructor(dustPath, dustName, dustData, options)
	{
		this.dustPath = dustPath;
		this.dustName = dustName;
		this.dustData = dustData;
		this.options = options;
	}

	render(request, cb)
	{
		dustUtil.render(this.dustPath, this.dustName, (typeof this.dustData==="function" ? this.dustData() : this.dustData), this.options, cb);
	}

	getContentType()
	{
		return "text/html;charset=utf-8";
	}
}

class WebRouter
{
	constructor(options={})
	{
		this.routes = {GET : {}, POST : {}, PUT : {}};
		this.options = options;
	}

	requestHandler(request, response)
	{
		const method = request.method.toUpperCase();
		if(!this.routes.hasOwnProperty(method))
		{
			response.writeHead(501, { "Content-Type" : "text/plain" });
			return response.end("Method [" + request.method + "] is not supported.");
		}

		const target = url.parse(request.url);
		if(!this.routes[method].hasOwnProperty(target.pathname))
		{
			response.writeHead(404, { "Content-Type" : "text/plain" });
			return response.end();
		}

		request.cookieData = {};
		if(request.headers && request.headers.cookie)
			request.cookieData = cookie.parse(request.headers.cookie);

		const responseHeaders =
		{
			"Date"          : new Date().toUTCString(),
			"Cache-Control" : "no-cache, no-store",
			"Vary"          : "Accept-Encoding",
			"Expires"       : "Thu, 01 Jan 1970 00:00:01 GMT"
		};

		const route = this.routes[method][target.pathname];
		responseHeaders["Content-Type"] = route.getContentType();

		if(request.method==="POST" || request.method==="PUT")
		{
			let postData = "";
			request.on("data", chunk => { postData += chunk; });
			request.on("end", () =>
			{
				if(this.options.parsePostDataAsJSON)
				{
					try
					{
						postData = JSON.parse(postData);
					}
					catch(err)
					{
						console.error("[%s] JSON postData parse error with: %s", target.pathname, postData);
						console.error(err);
					}
				}

				request.postData = postData;
				setImmediate(finishRequest);
			});
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
							meta.cookies.forEach(c => responseHeaders["Set-Cookie"].push(cookie.serialize(c.name, c.value, c)));
						}

						// TODO: support meta.headers for adding/removing custom responseHeaders
					}
					
					if(data && data.length>0 && request.headers["accept-encoding"] && request.headers["accept-encoding"].split(",").some(encoding => encoding.trim().toLowerCase()==="gzip"))
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
						console.error(err);
						response.writeHead(500, { "Content-Type" : "text/plain" });
						return response.end(err.stack || err.toString());
					}

					response.writeHead(200, responseHeaders);
					response.end(data);
				}
			);
		}
	}

	addRoute(methods, paths, route)
	{
		Array.toArray(paths).forEach(path => Array.toArray(methods).forEach(method =>
		{
			if(!this.routes.hasOwnProperty(method.toUpperCase()))
				return;

			this.routes[method.toUpperCase()][path] = route;
		}));
	}

	addDustRoute(methods, paths, dustPath, dustName, dustData)
	{
		this.addRoute(methods, paths, new DustRoute(dustPath, dustName, dustData, this.options));
	}

	addJSONRoute(methods, paths, handler)
	{
		this.addRoute(methods, paths, new JSONRoute(handler, this.options));
	}

	addTextRoute(methods, paths, handler)
	{
		this.addRoute(methods, paths, new TextRoute(handler, this.options));
	}

	listen(port, host, timeout)
	{
		this.server = http.createServer(this.requestHandler.bind(this));

		if(typeof timeout!=="undefined")
			this.server.timeout = timeout;
		this.server.listen(port, host);
	}
}

exports.WebRouter = WebRouter;
