'use strict';

carcloudApp.controller('DeviceListController',
    function ($modal, $scope, $q, resolvedDevice, Device, User) {

        $scope.devices = resolvedDevice;

        $scope.openAddDeviceModal = function () {
            $modal.open({
                templateUrl: 'templates/devices-add.html',
                controller: 'DeviceAddController',
                resolve: {
                    $parentScope: function () {
                        return $scope;
                    }
                }
            });
        };

        $scope.openEditDeviceModal = function (id) {
            $modal.open({
                templateUrl: 'templates/devices-edit.html',
                controller: 'DeviceEditController',
                resolve: {
                    $parentScope: function () {
                        return $scope;
                    },
                    resolvedDevice: function (Device) {
                        return Device.get({id: id});
                    }
                }
            });
        };

        $scope.openOwnersDeviceModal = function (id) {
            $modal.open({
                templateUrl: 'templates/devices-owners.html',
                controller: 'DeviceOwnersController',
                resolve: {
                    $parentScope: function () {
                        return $scope;
                    },
                    resolvedDevice: function (Device, $q) {
                        var deferred = $q.defer();

                        Device.get({'id': id}, function (device) {
                            device.resource("owners").get().$promise.then(function (owners) {
                                device.owners = owners;
                                deferred.resolve(device);
                            });
                        });

                        return deferred.promise;
                    }
                }
            });
        };

        $scope.delete = function (id) {
            Device.delete({id: id}, function () {
                delete $scope.devices[id];
            });
        };
    });

carcloudApp.controller('DeviceController', function ($scope, $filter, resolvedDevice, WebSocket, API_DETAILS) {

    var fromDate, toDate;

    $scope.device = resolvedDevice;

    var markers = [];

    var mapOptions = {
        zoom: 1,
        center: new google.maps.LatLng(0, 0)
    };

    var infoWindow = new google.maps.InfoWindow({maxWidth: 450});
    var map = new google.maps.Map(document.getElementById('map'), mapOptions);

    var addTrack = function (track) {
        if ((!fromDate && !toDate) || track.recordedAt >= fromDate && track.recordedAt <= toDate) {

            var marker = new google.maps.Marker({
                map: map,
                position: new google.maps.LatLng(track.latitude, track.longitude),
                title: 'Track ' + track.id
            });

            marker.content = generateTrackMarkerContent(track);

            google.maps.event.addListener(marker, 'click', function () {
                infoWindow.setContent('<h2>' + marker.title + '</h2>' + marker.content);
                infoWindow.open(map, marker);
            });

            markers.push(marker);
        }
    };

    var generateTrackMarkerContent = function (track) {
        var content = '<div class="infoWindowContent">';
        content = content + '<p>longitude: ' + track.longitude + '</p>';
        content = content + '<p>latitude: ' + track.latitude + '</p>';
        content = content + '<p>Recorded at: ' + new Date(track.recordedAt) + '</p>';
        if (track.fields.length > 0) {
            content = content + '<table><tr><th>Name</th><th>Value</th></tr>';
            angular.forEach(track.fields, function (field) {
                content = content + '<tr><td>' + field.name + '</td><td>' + field.value + '</td></tr>';
            });
            content = content + '</table></div>';
        }
        return content;
    };

    $scope.onChangeDate = function () {
        var dateFormat = 'yyyy-MM-dd';
        resolvedDevice.resource("tracks").query({
            'fromDate': $filter('date')($scope.fromDate, dateFormat),
            'toDate': $filter('date')($scope.toDate, dateFormat)
        }).$promise.then(function (tracks) {
                resolvedDevice.tracks = tracks;
                fromDate = new Date($filter('date')($scope.fromDate, dateFormat)).getTime();
                toDate = new Date($filter('date')($scope.toDate, dateFormat)).getTime();
                initializeMarkers();
            });
    };

    var initializeMarkers = function () {
        angular.forEach(markers, function (marker) {
            marker.setMap(null);
        });
        markers = [];
        angular.forEach(resolvedDevice.tracks, function (track) {
            addTrack(track);
        });
        var middle = markers[Math.round((markers.length - 1) / 2)];
        if (middle) {
            map.setCenter(middle.position);
            map.setZoom(8);
        }
    };

    initializeMarkers();

    WebSocket.init(API_DETAILS.baseUrl + 'ws');
    WebSocket.connect(function (frame) {
        WebSocket.subscribe("/topic/device/" + resolvedDevice.id, function (message) {
            addTrack(JSON.parse(message.body));
            map.setCenter(markers[markers.length - 1].position);
            map.setZoom(8);
        });
    });


    $scope.openInfoWindow = function (e, selectedMarker) {
        e.preventDefault();
        google.maps.event.trigger(selectedMarker, 'click');
    };
});

carcloudApp.controller('DeviceAddController',
    function ($scope, $parentScope, $modalInstance, Device) {
        $scope.create = function () {
            Device.save($scope.device,
                function () {
                    Device.query().$promise.then(function (devices) {
                        angular.forEach(devices, function (device) {
                            if (!$parentScope.devices[device.id]) {
                                $parentScope.devices[device.id] = device;
                            }
                        });
                    });
                    $modalInstance.close();
                });
        };

        $scope.cancel = function () {
            $modalInstance.dismiss('cancel');
        };
    });

carcloudApp.controller('DeviceEditController',
    function ($scope, $parentScope, $modalInstance, Device, resolvedDevice) {

        $scope.device = resolvedDevice;

        $scope.update = function () {
            Device.update($scope.device,
                function () {
                    $parentScope.devices[$scope.device.id] =
                        $scope.device;
                    $modalInstance.close();
                });
        };

        $scope.cancel = function () {
            $modalInstance.dismiss('cancel');
        };
    });

carcloudApp.controller('DeviceOwnersController',
    function ($scope, $parentScope, $modalInstance, Device, User,
              resolvedDevice) {

        $scope.device = resolvedDevice;

        $scope.cancel = function () {
            $modalInstance.dismiss('cancel');
        };

        $scope.getUsers = function (username) {
            return User.get({'username': username}).$promise;
        };

        $scope.addOwner = function () {
            resolvedDevice.resource("owners").save($scope.usernameSelected,
                function () {

                    $scope.device.resource("owners").get().$promise.then(function (owners) {
                        angular.forEach(owners,
                            function (value,
                                      key) {
                                if (!$scope.device.owners[key]) {
                                    $scope.device.owners[key] =
                                        value;
                                }
                            });
                        $scope.usernameSelected =
                            undefined;
                    });

                });
        };

        $scope.removeOwner = function (username) {
            $scope.device.resource("owners").delete({id: username}).$promise.then(function (success) {
                delete $scope.device.owners[username];
            });
        }
    });

carcloudApp.controller('DeviceAlertsController',
    function ($scope, $modal, resolvedDevice) {
        $scope.device = resolvedDevice;


        $scope.openAddAlertModal = function () {
            $modal.open({
                templateUrl: 'templates/device-alerts-add.html',
                controller: 'DeviceAlertsAddController',
                resolve: {
                    $parentScope: function () {
                        return $scope;
                    },
                    data: function() {
                        return undefined;
                    }
                }
            });
        };

    });

carcloudApp.controller('DeviceAlertsAddController',
    function ($scope, $parentScope, $modal, $modalInstance, Device, data) {

        $scope.alert = data || {'alertFields': []};

        $scope.create = function () {

            console.log($scope.alert);
            console.log($parentScope.device);

            var fields = $scope.alert.alertFields;
            delete $scope.alert.alertFields;

            $parentScope.device.resource("alerts").save($scope.alert, function(alert) {
                angular.forEach(fields, function(field) {
                    alert.resource("fields").save(field, function(fields) {
                        console.log("success");
                    });
                });
            });
        };

        $scope.cancel = function () {

            console.log("CANCELING AN ALERT");

            $modalInstance.dismiss('cancel');
        };

        $scope.openAddCriteriaAlertModal = function () {
            $modalInstance.dismiss('cancel');
            $modal.open({
                templateUrl: 'templates/device-alerts-add-alert-field.html',
                controller: 'DeviceAlertsAddCriteriaController',
                resolve: {
                    $parentScope: function () {
                        return $scope;
                    },
                    $grandParentScope: function() {
                        return $parentScope;
                    }
                }
            });
        };

    });

carcloudApp.controller('DeviceAlertsAddCriteriaController',
    function ($scope, $grandParentScope, $parentScope, $modal, $modalInstance) {


        $scope.alertField = {
            'field': {
                'type': 'string'
            },
            'operation': 'EQUALSTO'
        };

        $scope.types = ['string', 'boolean', 'integer'];

        $scope.getOperations = function() {
            var operations = {
                'string': ['EQUALSTO'],
                'boolean': ['EQUALSTO'],
                'integer': ['EQUALSTO', 'LESSTHAN', 'LESSTHANANDEQUALSTO', 'GREATERTHAN', 'GREATERTHANANDEQUALSTO']
            };
            return operations[$scope.alertField.field.type]
        };

        $scope.create = function () {
            console.log($parentScope.alert);
            $parentScope.alert.alertFields.push($scope.alertField);
            $modalInstance.dismiss();
            $modal.open({
                templateUrl: 'templates/device-alerts-add.html',
                controller: 'DeviceAlertsAddController',
                resolve: {
                    data: function () {
                        return $parentScope.alert;
                    },
                    $parentScope: function() {
                        return $grandParentScope
                    }
                }
            });
        };

        $scope.cancel = function () {
            $modalInstance.dismiss();
            $modal.open({
                templateUrl: 'templates/device-alerts-add.html',
                controller: 'DeviceAlertsAddController',
                resolve: {
                    data: function () {
                        return $parentScope.alert;
                    },
                    $parentScope: function() {
                        return $grandParentScope
                    }
                }
            });
        };
    });
