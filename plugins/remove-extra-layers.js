// @author         johnd0e
// @name           Remove extra layers
// @category       Layer
// @version        0.1.0
// @description    Remove 'Beacons' and 'Frackers' from layerChooser (still keeping them on map)


// use own namespace for plugin
var removeExtraLayers = {};
window.plugin.remove = removeExtraLayers;

removeExtraLayers.names = ['Beacons', 'Frackers'];

function setup () {
  removeExtraLayers.names.forEach(function (name) {
    window.layerChooser.removeLayer(name, 'keepOnMap');
  });
}

/* exported setup */
