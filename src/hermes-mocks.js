'use strict';

(window.jasmine || window.mocha) && (function(window) {
    var baseSpec = {
        hermesMocks: [],
        hermesMockStack: {}
    };
    var currentSpec = baseSpec;
    var mockData = {};
    var mockDataCounter = 0;

    beforeEach(function() {
        currentSpec = this;
        currentSpec.hermesMocks = [];
        currentSpec.hermesMockStack = {};
    });

    afterEach(function() {
        for (var id in currentSpec.hermesMockStack) {
            mockData[id] = currentSpec.hermesMockStack[id];
        }

        for (var i = 0; i < currentSpec.hermesMocks.length; i++) {
            delete mockData[currentSpec.hermesMocks[i]];
        }

        currentSpec.hermesMockStack = null;
        currentSpec.hermesMocks = null;
        currentSpec = baseSpec;
    });

    function isSpecRunning() {
        return currentSpec && (window.mocha || currentSpec.queue.running);
    }

    var createHermesMockImpl = function(Hermes) {
        if (Hermes.mockImpl != undefined) {
            return Hermes.mockImpl;
        }

        var Element = function(service, baseUrl, name) {
            var methods = ['get', 'put', 'post', 'patch', 'delete'];
            var url = baseUrl + '/' + name;

            _.each(methods, function(method) {
                this[method] = function(callback, status, headers) {
                    if (!_.isFunction(callback)) {
                        var data = callback;

                        if (status == undefined) {
                            status = 200;
                        }

                        callback = function() {
                            return {
                                data: data,
                                status: status,
                                headers: headers
                            };
                        };
                    }

                    return service.sendRequest(method, url, callback);
                };
            }, this);

            this.element = function(name) {
                return new Element(service, url, name);
            };
        };

        var service = {};

        service.processMock = function(id, config) {
            if (mockData[id]) {
                return mockData[id](config);
            }

            return undefined;
        };

        service.sendRequest = function(method, url, callback) {
            var id = mockDataCounter++;
            var oldId = Hermes.mockCall(method, url, id);

            if (oldId != undefined) {
                currentSpec.hermesMockStack[id] = mockData[oldId];
                mockData[oldId] = callback;
            } else {
                currentSpec.hermesMocks.push(id);
                mockData[id] = callback;
            }
        };

        service.element = function(name) {
            return new Element(this, Hermes.configuration.baseUrl, name);
        };

        Hermes.mockImpl = service;
        return service;
    };

    window.createHermesMock = function(Hermes) {
        var run = function() {
            return createHermesMockImpl(Hermes);
        };

        return isSpecRunning() ? run(Hermes) : run;
    };
})(window);
