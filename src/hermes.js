'use strict';

angular.module('hermes', [])
.provider('Hermes', function() {
	var defaultConfiguration;

	var Configuration = function() {
		this.baseUrl = '';

		this.setBaseUrl = function(url) {
			this.baseUrl = url;
		};
	};

	var Element = function(service, baseUrl, name) {
		var methods = ['get', 'put', 'post', 'patch', 'delete'];
		var url = baseUrl + '/' + name;

		_.each(methods, function(method) {
			this[method] = function(config) {
				return service.sendRequest(method, url, config || {});
			};
		}, this);

		this.element = function(name) {
			return new ELement(service, url, name);
		};
	};

	var Service = function($q, $http, configuration) {
		var hookIdCounter = 0;
		var builderHooks = [];
		var errorHooks = [];

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

		this.sendRequest = function(method, url, config) {
			var defered = $q.defer();
			var request = _.merge({
				url: url,
				method: method,
				headers: {},
				params: {},
				cache: false
			}, config);

			this.processRequest({
				request: request,
				result: defered
			});

			return defered.promise;
		};

		this.processRequest = function(requestData) {
			var self = this;
			var request = _.clone(requestData.request);
			var defered = $q.defer();
			
			_.each(builderHooks, function(hook) {
				request = hook.fn(request);
			});

			$http(request)
			.success(function(data, status, headers, config) {
				requestData.result.resolve(data, status, headers);
			})
			.error(function(data, status, headers, config) {
				var waiter;

				_.each(errorHooks, function(hook) {
					var result = hook.fn(data, status, headers, request);

					if (result && _.isFunction(result.then)) {
						waiter = result;
					}
				});

				if (waiter) {
					waiter.then(function() {
						self.processRequest(requestData);
					}, function() {
						requestData.result.reject(data, status, headers);
					});
				} else {
					requestData.result.reject(data, status, headers);
				}
			});
		};

		this.element = function(name) {
			return new Element(this, configuration.baseUrl, name);
		};
	};

	this.$get = function($q, $http) {
		return new Service($q, $http, defaultConfiguration);
	};

	this.Configuration = Configuration;
	this.Service = Service;

	defaultConfiguration = new Configuration();
});

