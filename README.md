#Hermes
[![Build Status](https://travis-ci.org/pagarme/hermes.png)](https://travis-ci.org/pagarme/hermes)

Hermes is an AngularJS service that provides a direct and feature rich wrapper around $http for REST services.

Soon the documentation will be complete.

#Basic usage
Hermes provides HermesProvider which can be used to create an Hermes service with an alternative configuration(`HermesProvider.createService`) and provides default configuration and a default service instance.

End points are accessed in hierarchical form as following:
````javascript
Hermes.element('factory').element('cars').element('ferrari')
````
The element functions returns an HermesElement which can call all available HTTP methods and chain another element to the hierarchy as well.

To call an HTTP method do as following:
````javascript
Hermes.element('factory').element('cars').get({
    params: {
        'starting_id': 100
    }
});
````
All parameters from $http are available, although some may be overridden by Hermes(`url` and `method` for example).

#Request Hook
Request hooks can be set by using the `Hermes.configuration.requestBuilderHooks` array.
They can be used to extend all request in uniform way. Note that they will be chained and you can declare custom attributes on the request to pass parameters to hooks.

````javascript
Hermes.configuration.requestBuilderHooks.push(function (request) {
    request.params['session_id'] = AuthenticationService.getSessionId();
    return request;
});
````

#Error Hook
Request hooks can be set by using the `Hermes.configuration.responseErrorHooks` array.
They can be used to notify global errors as session expiration.
One of Hermes features is the capability to resend some request after an error as soon as a promise is resolved.

````javascript
Hermes.configuration.responseErrorHooks.push(function (data, status, headers, request) {
  if (status == 401 || status == 410) {
    var sessionPromise = $q.defer();

    /* Do some stuff like showing a login dialog
       and accept or reject the promise. */
    AuthenticationService.renewSession(function (result) {
      if (result) {
        sessionPromise.resolve();
      }
      else {
        sessionPromise.reject();
      }
    });

    return sessionPromise.promise;
  }
});
````
