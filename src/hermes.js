'use strict';

angular.module('hermes', [])
.provider('Hermes', function() {
	var HermesProvider = this;
	var defaultConfiguration;

	var Configuration = function() {
		this.baseUrl = '';

		this.setBaseUrl = function(url) {
			this.baseUrl = url;
		};
	};

	var Element = function(service, baseUrl, name) {
		var methods = ['get', 'put', 'post', 'patch', 'delete'];
		var elementCache = {};

		this.url = baseUrl + '/' + name;

		_.each(methods, function(method) {
			this[method] = function(config) {
				return service.dispatchRequest(method, this, config || {});
			};
		}, this);

		this.element = function(name) {
			return elementCache[name] || (elementCache[name] = new HermesProvider.Element(service, this.url, name));
		};
	};

	var Service = function($q, $http, configuration) {
		var hookIdCounter = 0;
		var builderHooks = [];
		var errorHooks = [];
		var elementCache = {};

		var addHook = function(db, fn, priority) {
			var defered = $q.defer();
			var id = hookIdCounter++;

			if (!priority) {
				priority = 0;
			}
			
			for (var i = 0; i <= db.length; i++) {
				if (i == db.length || priority >= db[i].priority) {
					db.splice(i, 0, {
						id: id,
						priority: priority,
						fn: fn
					});
					break;
				}
			}

			defered.promise.then(function() {
				_.remove(db, { id: id });
			});

			return defered;
		};

		this.addBuilderHook = _.bind(addHook, this, builderHooks); 
		this.addErrorHook = _.bind(addHook, this, errorHooks);

		this.dispatchRequest = function(method, element, config) {
			var defered = $q.defer();
			var request = _.merge({
				url: element.url,
				method: method,
				headers: {},
				params: {},
				cache: false
			}, config);

			this.processRequest({
				request: request,
				result: defered,
				element: element
			});

			return defered.promise;
		};

		this.sendRequest = function(requestData, request) {
			return $http(request);
		};

		this.processRequest = function(requestData) {
			var self = this;
			var request = _.clone(requestData.request);
			var defered = $q.defer();

			_.each(builderHooks, function(hook) {
				request = hook.fn(request);
			});

			this.sendRequest(requestData, request)
			.then(function(req) {
				requestData.result.resolve(req.data, req.status, req.headers);
			}, function(req) {
				var waiter;

				_.each(errorHooks, function(hook) {
					var result = hook.fn(req.data, req.status, req.headers, request);

					if (result && _.isFunction(result.then)) {
						waiter = result;
					}
				});

				if (waiter) {
					waiter.then(function() {
						self.processRequest(requestData);
					}, function() {
						requestData.result.reject(req.data, req.status, req.headers);
					});
				} else {
					requestData.result.reject(req.data, req.status, req.headers);
				}
			});
		};

		this.element = function(name) {
			return elementCache[name] || (elementCache[name] = new HermesProvider.Element(this, configuration.baseUrl, name));
		};
	};

	this.$get = function($q, $http) {
		return new HermesProvider.Service($q, $http, defaultConfiguration);
	};

	this.Configuration = Configuration;
	this.Service = Service;
	this.Element = Element;

	defaultConfiguration = new Configuration();
});

