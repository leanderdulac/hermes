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
			var self = this;
			var prepareName = 'prepare' + method.charAt(0).toUpperCase() + method.slice(1);

			this[prepareName] = function(config) {
				return function() {
					return service.prepareRequest(self, method, config);
				};
			};

			this[method] = function(config) {
				return service.dispatchRequest(this, this[prepareName](config || {}));
			};
		}, this);

		this.element = function(name) {
			return elementCache[name] || (elementCache[name] = new HermesProvider.Element(service, this.url, name));
		};
	};

	var Service = function($q, $rootScope, $http, configuration) {
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

		this.prepareRequest = function(element, method, config) {
			var request = _.merge({
				url: element.url,
				method: method,
				headers: {},
				params: {},
				cache: false
			}, config);
			
			_.each(builderHooks, function(hook) {
				request = hook.fn(request);
			});

			return request;
		};

		this.dispatchRequest = function(element, build) {
			var defered = $q.defer();

			defered.promise.success = function(handler) {
				this.then(function(response) {
					return handler(response.data, response.status, response.headers);
				});

				return this;
			};

			defered.promise.error = function(handler) {
				this.then(null, function(response) {
					return handler(response.data, response.status, response.headers);
				});

				return this;
			};

			this.processRequest({
				build: build,
				result: defered,
				element: element
			});

			return defered.promise;
		};

		this.sendRequest = function(requestData, request) {
			if (request.chunked) {
				var defered = $q.defer();
				var xhr = new XMLHttpRequest();
				var partialProgress = 0;

				var progress = function(final) {
					var response;
					
					response = xhr.response.slice(partialProgress);
					partialProgress = xhr.response.length;

					if (request.chunkReceived) {
						$rootScope.$apply(function() {
							request.chunkReceived(response, xhr.status);
						});
					}

					if (final) {
						if (xhr.status == 200) {
							defered.resolve({
								status: 200,
								data: xhr.response,
								headers: xhr.getAllResponseHeaders()
							});
						} else {
							defered.reject({
								status: xhr.status,
								data: xhr.response,
								headers: xhr.getAllResponseHeaders()
							});
						}
					}
				};

				xhr.open(request.method, request.url, true);

				_.each(request.headers, function(value, key) {
					if (value !== undefined) {
						xhr.setRequestHeader(key, value);
					}
				});

				xhr.onprogress = function() {
					if (xhr.readyState == 2) {
						if (request.headersReceived) {
							$rootScope.$apply(function() {
								request.headersReceived(xhr.status, xhr.getAllResponseHeaders());
							});
						}
					} else if (xhr.readyState == 3 || xhr.readyState == 4) {
						progress(xhr.readyState == 4);
					}
				};

				xhr.send(request.data || null);

				return defered.promise;
			} else {
				return $http(request);
			}
		};

		this.processRequest = function(requestData) {
			var self = this;
			var request = requestData.build();
			var defered = $q.defer();

			this.sendRequest(requestData, request)
			.then(function(req) {
				requestData.result.resolve(req);
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
						requestData.result.reject(req);
					});
				} else {
					requestData.result.reject(req);
				}
			});
		};

		this.element = function(name) {
			return elementCache[name] || (elementCache[name] = new HermesProvider.Element(this, configuration.baseUrl, name));
		};
	};

	this.$get = function($q, $rootScope, $http) {
		return new HermesProvider.Service($q, $rootScope, $http, defaultConfiguration);
	};

	this.Configuration = Configuration;
	this.Service = Service;
	this.Element = Element;

	defaultConfiguration = new Configuration();
});

