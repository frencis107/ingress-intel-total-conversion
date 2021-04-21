// @author         johnd0e
// @name           Hide portal levels
// @category       Layer
// @version        0.1.0
// @description    Replace all levels with single layerChooser's entry; reverting on longclick


// use own namespace for plugin
var hideLevels = {};
window.plugin.hideLevels = hideLevels;

hideLevels.initCollapsed = true;

function setup () {
  var ctrl = window.layerChooser;

  hideLevels.portals = L.layerGroup(null, {
    notPersistent: true,
    sortPriority: -1000
  });

  var levels = window.layerChooser._layers.filter(function (el) {
    return el.overlay && el.layer._name.endsWith('Portals');
  });

  hideLevels.collapse = function () {
    ctrl.addOverlay(hideLevels.portals, 'Portals');
    levels.forEach(function (info) {
      ctrl.removeLayer(info.layer, 'keepOnMap');
      hideLevels.portals.addLayer(info.layer);
    });
  }

  hideLevels.expand = function () {
    levels.forEach(function (el) {
      ctrl.addOverlay(el.layer, el.name);
    });
    hideLevels.portals._layers = {};
    ctrl.removeLayer(hideLevels.portals);
  }

  levels.forEach(function (el) {
    el.layer.on('longclick', function (e) { // collapse
      e.preventDefault();
      hideLevels.collapse();
    });
  });

  hideLevels.portals.on('longclick', function (e) { // expand
    e.preventDefault();
    hideLevels.expand();
  });

  hideLevels.portals.on('add remove', function (e) { // store status
    levels.forEach(function (el) {
      ctrl._storeOverlayState(el.layer._name, e.type === 'add'); //??
    });
  });

  if (hideLevels.initCollapsed) {
    hideLevels.collapse();
  }
}

/* exported setup */
