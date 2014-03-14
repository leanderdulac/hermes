'use strict';

(function(window) {
    var currentSpec;

    beforeEach(function() {
        currentSpec = this;
        currentSpec.hermesExpects = [];
    });

    afterEach(function() {
        _.each(currentSpec.hermesExpects, function(e) {
            if (!e.ok) {
                throw new Error("Unmatched expectation: " + e.method + " " + e.element.url);
            }
        });

        currentSpec.hermesExpects = null;
        currentSpec = null;
    });

    angular.module('hermes').config(function(HermesProvider) {
        var methods = ['Get', 'Put', 'Post', 'Patch', 'Delete'];
        var preService = HermesProvider.Service;
        var preElement = HermesProvider.Element;

        HermesProvider.Service = function($q) {
            preService.apply(this, arguments);

			this.doProcessRequest = this.processRequest;

            this.sendRequest = function(request, data) {
				var defered = $q.defer();

				if (request.element.mocks && request.element.mocks[request.request.method]) {
                    var result = request.element.mocks[request.request.method](data);
					
					if (!result) {
						result = {
							status: 400
						};
					}

                    if (result.status === undefined) {
                        result.status = 400;
                    }

                    if (result.status == 400) {
                        defered.resolve(result);
                    } else {
                        defered.reject(result);
                    }
                } else {
					defered.resolve({ status: 400 });
				}

				return defered.promise;
            };

            this.processRequest = function(requestData) {
                (this.mockQueue || (this.mockQueue = [])).push(requestData);
            };

            this.flush = function() {
				if (!this.mockQueue) {
                    return;
                }

                while (this.mockQueue.length > 0) {
                    this.doProcessRequest(this.mockQueue.shift());
                }
            };

            this.verifyNoPendingRequests = function() {
                if (this.mockQueue.length > 0) {
                    throw new Error("Pending requests: " + this.mockQueue.length);
                }
            };
        };

        HermesProvider.Element = function() {
            preElement.apply(this, arguments);

            _.each(methods, function(method) {
                this['when' + method] = function(cb) {
                    (this.mocks || (this.mocks = {}))[method.toLowerCase()] = cb;
                };

                this['expect' + method] = function(cb) {
                    var expect = {
                        method: method,
                        element: this,
                        ok: false
                    };

                    (this.mocks || (this.mocks = {}))[method.toLowerCase()] = function() {
                        if (cb) {
                            cb.apply(undefined, arguments);
                        }

                        expect.ok = true;
                    };

                    currentSpec.hermesExpects.push(expect);
                };
            }, this);
        };
    });
})(window);

