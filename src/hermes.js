'use strict';

(function() {

	var module = angular.module('hermes', []);

	module.provider('Hermes', function() {
		var defaultConfiguration;

		var Configuration = function() {
			this.baseUrl = '';
			this.requestBuilderHooks = [];
			this.responseErrorHooks = [];

			this.setBaseUrl = function(url) {
				this.baseUrl = url;

				if (this.baseUrl[this.baseUrl.length - 1] == '/') {
					this.baseUrl = this.baseUrl.substr(0, this.baseUrl.length - 1);
				}
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
				return new Element(service, url, name);
			};
		};

		var createService = function($q, $http, configuration) {
			var service = {};

			service.configuration = configuration;

			service.processRequest = function(requestData) {
				var self = this;
				var request = _.extend({}, requestData.request);

				_.each(this.configuration.requestBuilderHooks, function(hook) {
					request = hook(request);
				}, this);

				$http(request).success(function(data, status, headers, config) {
					requestData.result.resolve(data, status, headers);
				}).error(function(data, status, headers, config) {
					_.each(self.configuration.responseErrorHooks, function(hook) {
						var result = hook(data, status, headers, request);

						if (_.isObject(result)) {
							result.then(function() {
								self.processRequest(requestData);
							});
						} else {
							requestData.result.reject({
								data: data, 
								status: status,
								headers: headers
							});
						}
					}, self);
				});
			};

			service.sendRequest = function(method, url, config) {
				var deferred = $q.defer();

				var request = _.merge({
					url: url,
					method: method,
					headers: {},
					params: {},
					cache: false
				}, config);

				var requestData = {
					request: request,
					result: deferred
				};

				this.processRequest(requestData);

				return deferred.promise;
			};

			service.element = function(name) {
				return new Element(this, configuration.baseUrl, name);
			};

			return service;
		};

		defaultConfiguration = new Configuration();

		this.Configuration = Configuration;
		this.defaultConfiguration = defaultConfiguration;
		this.createService = createService;

		this.$get = function($q, $http) {
			return createService($q, $http, defaultConfiguration);
		};
	});

})();
