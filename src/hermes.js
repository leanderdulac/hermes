'use strict';

angular.module('hermes', [])
.factory('HttpStream', function($rootScope, $q) {
	return function(request) {
		var defered = $q.defer();
		var xhr = new XMLHttpRequest();
		var headersArrived = false;
		var partialProgress = 0;

		var checkHeaders = function() {
			if (headersArrived) {
				return;
			}

			$rootScope.$apply(function() {
				request.stream.writePreamble({
					status: xhr.status,
					headers: xhr.getAllResponseHeaders()
				});
			});

			headersArrived = true;
		};

		var progress = function(final) {
			var response;

			response = xhr.response.slice(partialProgress);
			partialProgress = xhr.response.length;

			$rootScope.$apply(function() {
				request.stream.write(response);
			});

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

				$rootScope.$apply(function() {
					request.stream.close();
				});
			}
		};

		xhr.open(request.method, request.url, true);

		xhr.onprogress = function() {
			if (xhr.readyState == 2) {
				checkHeaders();
			} else if (xhr.readyState == 3 || xhr.readyState == 4) {
				checkHeaders();
				progress(xhr.readyState == 4);
			}
		};

		_.each(request.headers, function(value, key) {
			if (value !== undefined) {
				xhr.setRequestHeader(key, value);
			}
		});

		xhr.send(request.data || null);

		return defered.promise;
	};
})
.factory('HermesPromise', function($q) {
	return function() {
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

		return defered;
	};
})
.provider('Hermes', function() {
	var HermesProvider = this;
	var defaultConfiguration;

	var Configuration = function() {
		this.baseUrl = '';

		this.setBaseUrl = function(url) {
			this.baseUrl = url;
		};
	};

	var Request = function(element, method, request) {
		var rawRequest = _.clone(request);

		this.method = method;
		this.element = element;

		this.getRawRequest = function() {
			return rawRequest;
		};

		this.build = function(service) {
			var request = _.merge({
				url: element.url,
				method: this.method,
				headers: {},
				params: {},
				cache: false
			}, this.getRawRequest());

			return service.prepareRequest(request) || request;
		};
	};

	var Element = function(service, baseUrl, name) {
		var elementCache;

		if (HermesProvider.cacheElements) {
			elementCache = {};
		}

		this.url = baseUrl + '/' + name;

		_.each(HermesProvider.methods, function(method) {
			var self = this;
			var prepareName = 'prepare' + method.charAt(0).toUpperCase() + method.slice(1);

			this[prepareName] = function(config) {
				return new Request(this, method, config);
			};

			this[method] = function(config) {
				return service.dispatchRequest(this[prepareName](config || {}));
			};
		}, this);

		this.element = function(name) {
			var self = this;
			var create = function() {
				return new HermesProvider.Element(service, self.url, name);
			};

			if (HermesProvider.cacheElements) {
				return elementCache[name] || (elementCache[name] = create());
			} else {
				return create();
			}
		};
	};

	var Service = function($q, $rootScope, $http, HermesPromise, HttpStream, configuration) {
		var hookIdCounter = 0;
		var builderHooks = [];
		var errorHooks = [];
		var elementCache;

		if (HermesProvider.cacheElements) {
			elementCache = {};
		}

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

		this.prepareRequest = function(request) {
			request.url = configuration.baseUrl + request.url;

			_.each(builderHooks, function(hook) {
				request = hook.fn(request);
			});
		};

		this.dispatchRequest = function(request) {
			var defered = new HermesPromise();

			this.processRequest({
				request: request,
				result: defered
			});

			return defered.promise;
		};

		this.sendRequest = function(request) {
			var built = request.build(this);

			if (built.stream) {
				return HttpStream(built);
			} else {
				return $http(built);
			}
		};

		this.processRequest = function(requestData) {
			var self = this;
			
			this.sendRequest(requestData.request)
			.then(function(res) {
				requestData.result.resolve(res);
			}, function(res) {
				var waiter;

				_.each(errorHooks, function(hook) {
					var result = hook.fn(res.data, res.status, res.headers, requestData.request);

					if (result && _.isFunction(result.then)) {
						waiter = result;
					}
				});

				if (waiter) {
					waiter.then(function() {
						self.processRequest(requestData);
					}, function() {
						requestData.result.reject(res);
					});
				} else {
					requestData.result.reject(res);
				}
			});
		};

		this.element = function(name) {
			var self = this;
			var create = function() {
				return new HermesProvider.Element(self, '', name);
			};

			if (HermesProvider.cacheElements) {
				return elementCache[name] || (elementCache[name] = create());
			} else {
				return create();
			}
		};
	};

	this.$get = function($injector) {
		return this.createService($injector, this.defaultConfiguration);
	};

	this.createService = function(injector, configuration) {
		return injector.instantiate(this.Service, {
			configuration: configuration
		});
	};

	this.methods = ['get', 'put', 'post', 'patch', 'delete'];
	this.defaultConfiguration = new Configuration();
	
	this.Configuration = Configuration;
	this.Service = Service;
	this.Element = Element;
});

