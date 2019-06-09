"use strict";

const XU = require("@sembiance/xu"),
	tiptoe = require("tiptoe"),
	http = require("http"),
	url = require("url"),
	fs = require("fs"),
	path = require("path"),
	cookie = require("cookie"),
	zlib = require("zlib"),
	fileUtil = require("@sembiance/xutil").file,
	formidable = require("formidable"),
	dustUtil = require("@sembiance/xutil").dust;

class TextRoute
{
	constructor(handler, options)
	{
		this.handler = handler;
		this.options = options;
	}

	render(req, cb)
	{
		this.handler(req, cb);
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

	render(req, cb)
	{
		this.handler(req, (err, data, meta) => cb(err, JSON.stringify(data), meta));
	}

	getContentType()
	{
		return "application/json;charset=utf-8";
	}
}

class FileRoute
{
	constructor(handler, options)
	{
		this.handler = handler;
		this.options = options;
		this.contentType = "application/unknown";
	}

	render(req, cb)
	{
		const self = this;

		tiptoe(
			function callHandler()
			{
				self.handler(req, this);
			},
			function loadFile(filePath, contentType)
			{
				this.data.fileName = path.basename(filePath);

				self.contentType = contentType;

				fs.readFile(filePath, this);
			},
			function sendFileBack(err, fileData)
			{
				if(err)
					return cb(err);

				const meta = {headers : {}};
				meta.headers["Content-Length"] = fileData.length;
				meta.headers["Content-Disposition"] = `attachment; filename="${this.data.fileName}"`;

				cb(undefined, fileData, meta);
			}
		);
	}

	getContentType()
	{
		return this.contentType;
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

	render(req, cb)
	{
		const self=this;

		tiptoe(
			function getDustData()
			{
				if(typeof self.dustData==="function")
					self.dustData(req, this);
				else
					this(undefined, self.dustData);
			},
			function render(dustData)
			{
				dustUtil.render(self.dustPath, self.dustName, dustData, self.options, this);
			},
			cb
		);
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
		this.uploadDir = options.uploadDir || fileUtil.generateTempFilePath();

		if(!fileUtil.existsSync(this.uploadDir))
			fs.mkdirSync(this.uploadDir);
	}

	requestHandler(req, res)
	{
		const method = req.method.toUpperCase();
		if(!this.routes.hasOwnProperty(method))
		{
			res.writeHead(501, { "Content-Type" : "text/plain" });
			return res.end("Method [" + req.method + "] is not supported.");
		}

		const target = new url.URL(req.url, (this.port===443 ? "https://" : "http://") + this.host + ((this.port!==443 && this.port!==80) ? (":" + this.port) : "") + "/");
		req.fullURL = target;

		if(!this.routes[method].hasOwnProperty(target.pathname))
		{
			res.writeHead(404, { "Content-Type" : "text/plain" });
			return res.end();
		}

		const responseHeaders =
		{
			"Date"          : new Date().toUTCString(),
			"Cache-Control" : "no-cache, no-store",
			"Vary"          : "Accept-Encoding",
			"Expires"       : "Thu, 01 Jan 1970 00:00:01 GMT"
		};

		const route = this.routes[method][target.pathname];

		const form = new formidable.IncomingForm();
		form.uploadDir = this.uploadDir;
		form.keepExtensions = true;
		form.maxFieldsSize = 50 * 1024 * 1024;

		tiptoe(
			function parseRequest()
			{
				form.parse(req, this);
			},
			function processRequest(fields, files)
			{
				req.cookieData = {};
				if(req.headers && req.headers.cookie)
					req.cookieData = cookie.parse(req.headers.cookie);

				req.postData = fields;
				req.files = files;

				route.render(req, this);
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

					responseHeaders["Content-Type"] = route.getContentType();

					if(meta.headers)
						Object.merge(responseHeaders, meta.headers);
				}
				
				if(data && data.length>0 && req.headers["accept-encoding"] && req.headers["accept-encoding"].split(",").some(encoding => encoding.trim().toLowerCase()==="gzip"))
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
					res.writeHead(500, { "Content-Type" : "text/plain" });
					return res.end(err.stack || err.toString());
				}

				res.writeHead(200, responseHeaders);
				res.end(data);
			}
		);
	}

	addRoute(methods, routePaths, route)
	{
		Array.force(routePaths).forEach(routePath => Array.force(methods).forEach(method =>
		{
			if(!this.routes.hasOwnProperty(method.toUpperCase()))
				return;

			this.routes[method.toUpperCase()][routePath] = route;
		}));
	}

	addDustRoute(methods, routePaths, dustPath, dustName, dustData)
	{
		this.addRoute(methods, routePaths, new DustRoute(dustPath, dustName, dustData, this.options));
	}

	addJSONRoute(methods, routePaths, handler)
	{
		this.addRoute(methods, routePaths, new JSONRoute(handler, this.options));
	}

	addTextRoute(methods, routePaths, handler)
	{
		this.addRoute(methods, routePaths, new TextRoute(handler, this.options));
	}

	addFileRoute(methods, routePaths, handler)
	{
		this.addRoute(methods, routePaths, new FileRoute(handler, this.options));
	}

	listen(port, host, timeout)
	{
		this.host = host;
		this.port = port;

		this.server = http.createServer(this.requestHandler.bind(this));

		if(typeof timeout!=="undefined")
			this.server.timeout = timeout;
		this.server.listen(port, host);
	}
}

exports.WebRouter = WebRouter;
