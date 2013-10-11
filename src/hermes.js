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
            service.mockData = {};

            service.processRequest = function(requestData) {
                var self = this;
                var request = _.extend({}, requestData.request);
                var deferIt = $q.defer();
                var skipHttp = false;

                _.each(this.configuration.requestBuilderHooks, function(hook) {
                    request = hook(request);
                }, this);

                deferIt.promise.then(function(data, status, headers, config) {
                    requestData.result.resolve(data, status, headers);
                }, function(data, status, headers, config) {
                    var waiter;

                    _.each(self.configuration.responseErrorHooks, function(hook) {
                        var result = hook(data, status, headers, request);

                        if (_.isObject(result)) {
                            waiter = result;
                        }
                    }, self);

                    if (waiter != undefined) {
                        waiter.then(function() {
                            self.processRequest(requestData);
                        });
                    } else {
                        requestData.result.reject({
                            data: data,
                            status: status,
                            headers: headers
                        });
                    }
                });

                if (this.mockImpl
                    && this.mockData[requestData.request.url] != undefined
                    && this.mockData[requestData.request.url][requestData.request.method] != undefined) {
                    var result = this.mockImpl.processMock(this.mockData[requestData.request.url][requestData.request.method], request);

                    if (result != undefined) {
                        if (result.status == 200) {
                            deferIt.resolve(result.data, result.status, result.headers, request);
                        } else {
                            deferIt.reject(result.data, result.status, result.headers, request);
                        }

                        skipHttp = true;
                    }
                }

                if (!skipHttp) {
                    $http(request).success(function (data, status, headers, config) {
                        deferIt.resolve(data, status, headers, config);
                    }).error(function (data, status, headers, config) {
                        deferIt.reject(data, status, headers, config);
                    });
                }
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

            service.mockCall = function(method, url, id) {
                if (this.mockData[url] == undefined) {
                    this.mockData[url] = {};
                }

                if (this.mockData[url][method] != undefined) {
                    return this.mockData[url][method];
                }

                this.mockData[url][method] = id;
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
