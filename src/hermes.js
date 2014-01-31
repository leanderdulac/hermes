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
		var builderHooks = [];
		var errorHooks = [];

		this.addBuilderHook = function(hook) {
			var defered = $q.defer();
			var index = builderHooks.length;

			builderHooks.push(hook);

			defered.promise.then(function() {
				builderHooks.splice(index);
			});

			return defered;
		};

		this.addErrorHook = function(hook) {
			var defered = $q.defer();
			var index = errorHooks.length;

			errorHooks.push(hook);

			defered.promise.then(function() {
				errorHooks.splice(index);
			});

			return defered;
		};

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
				request = hook(request);
			});

			$http(request)
			.success(function(data, status, headers, config) {
				requestData.result.resolve(data, status, headers);
			})
			.error(function(data, status, headers, config) {
				var waiter;

				_.each(errorHooks, function(hook) {
					var result = hook(data, status, headers, request);

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

