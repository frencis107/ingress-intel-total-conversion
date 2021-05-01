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

  hideLevels.portals = L.layerGroup();

  var levels = window.layerChooser._layers.filter(function (el) {
    return el.overlay && el.layer._name.endsWith('Portals');
  });

  hideLevels.collapse = function () {
    var allDisabled = true;
    levels.forEach(function (info) {
      allDisabled = allDisabled && !info.layer._map;
      ctrl.removeLayer(info.layer, 'keepOnMap');
      hideLevels.portals.addLayer(info.layer);
    });
    ctrl.addOverlay(hideLevels.portals, 'Portals', {
      persistent: false,
      sortPriority: -1000,
      enable: !allDisabled
    });
  }

  hideLevels.expand = function () {
    var enable = !!hideLevels.portals._map;
    levels.forEach(function (el) {
      ctrl.addOverlay(el.layer, el.name, {enable: enable});
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

  if (hideLevels.initCollapsed) {
    hideLevels.collapse();
  }
}

/* exported setup */
