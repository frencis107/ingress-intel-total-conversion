/*
 * @class LayerChooser
 * @aka window.LayerChooser
 * @inherits L.Controls.Layers
 *
 * Provides 'persistence' of layers display state between sessions, saving it to localStorage.
 * Every overlay is added to map automatically if it's last state was active.
 * When no record exists - active is assumed, except when layer has option `defaultDisabled`.
 *
 * Also some additional methods provided, see below.
 */

var LayerChooser = L.Control.Layers.extend({
  initialize: function (baseLayers, overlays, options) {
    this._overlayStatus = {};
    var layersJSON = localStorage['ingress.intelmap.layergroupdisplayed'];
    if (layersJSON) {
      try {
        this._overlayStatus = JSON.parse(layersJSON);
      } catch (e) {
        log.error(e);
      }
    }
    window.overlayStatus = this._overlayStatus; // compatibility
    this._mapToAdd = options && options.map;
    L.Control.Layers.prototype.initialize.apply(this, arguments);
  },

  _addLayer: function (layer, name, overlay) {
    L.Control.Layers.prototype._addLayer.apply(this, arguments);
    if (overlay) {
      if (layer._map) {
        this._storeOverlayState(name, true);
      } else {
        var defaultState = !layer.options.defaultDisabled;
        if (this._isOverlayDisplayed(name, defaultState)) {
          layer.addTo(this._map || this._mapToAdd);
        }
      }
      layer._statusTracking = function (e) {
        this._storeOverlayState(name, e.type === 'add');
      };
      layer.on('add remove', layer._statusTracking, this);
    }
  },

  // @method removeLayer(layer: Layer|String): this
  // Removes the given layer from the control.
  // Either layer object or it's name in the control must be specified.
  removeLayer: function (layer) {
    if (!(layer instanceof L.Layer)) {
      layer = this.getLayerByName(layer);
    }
    if (layer && layer._statusTracking) {
      layer.off('add remove', layer._statusTracking, this);
      delete layer._statusTracking;
    }
    return L.Control.Layers.prototype.removeLayer.apply(this, arguments);
  },

  _storeOverlayState: function (name, isDisplayed) {
    this._overlayStatus[name] = isDisplayed;
    localStorage['ingress.intelmap.layergroupdisplayed'] = JSON.stringify(this._overlayStatus);
  },

  _isOverlayDisplayed: function (name, defaultState) {
    if (name in this._overlayStatus) {
      return this._overlayStatus[name];
    }
    return defaultState;
  },

  // layer: either Layer or it's name in the control
  _layerInfo: function (layer) {
    var prop = layer instanceof L.Layer ? 'layer' : 'name';
    return this._layers.find(function (el) {
      return el[prop] === layer;
    });
  },

  // @method getLayerByName(name: String): Layer
  // Returns layer by it's name in the control.
  getLayerByName: function (name) {
    var info = this._layerInfo(name);
    return info && info.layer;
  },

  // @method showLayer(layer: Layer|String|Number, display?: Boolean): this
  // Switches layer's display state to given value (true by default).
  // Layer can be specified also by it's name in the control.
  showLayer: function (layer, display) {
    var info = this._layers[layer] || this._layerInfo(layer);
    if (!info) {
      log.warn('Layer not found');
      return this;
    }
    var map = this._map;
    if (display || arguments.length === 1) {
      if (!map.hasLayer(info.layer)) {
        if (!info.overlay) {
          // if it's a base layer, remove any others
          this._layers.forEach(function (el) {
            if (!el.overlay && el.layer !== info.layer) {
              map.removeLayer(el.layer);
            }
          });
        }
        map.addLayer(info.layer);
      }
    } else {
      map.removeLayer(info.layer);
    }
    return this;
  },

  // adds listeners to the overlays list to make inputs toggleable.
  _initLayout: function () {
    L.Control.Layers.prototype._initLayout.call(this);
    $(this._overlaysList).on('click taphold', 'label', function (e) {
      if (!(e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.type === 'taphold')) {
        return;
      }
      // e.preventDefault(); // seems no effect
      var input = e.target.closest('label').querySelector('input');
      var idx = this._layerControlInputs.indexOf(input);
      this._toggleOverlay(idx);
    }.bind(this));
  },

  _filterOverlays: function (el) {
    return el.overlay &&
      ['DEBUG Data Tiles', 'Resistance', 'Enlightened'].indexOf(el.name) === -1;
  },

  // Hides all the control's overlays except given one,
  // or restores all, if it was the only one displayed (or none was displayed).
  _toggleOverlay: function (idx) {
    var info = this._layers[idx];
    if (!info || !info.overlay) {
      log.warn('Overlay not found: ', info);
      return;
    }
    var map = this._map;

    var isChecked = map.hasLayer(info.layer);
    var checked = 0;
    var overlays = this._layers.filter(this._filterOverlays);
    overlays.forEach(function (el) {
      if (map.hasLayer(el.layer)) { checked++; }
    });

    if (checked === 0 || isChecked && checked === 1) {
      // if nothing is selected, or specified overlay is exclusive,
      // assume all boxes should be checked again
      overlays.forEach(function (el) {
        if (!el.layer.options.defaultDisabled) {
          map.addLayer(el.layer);
        }
      });
    } else {
      // uncheck all, check specified
      overlays.forEach(function (el) {
        if (el.layer === info.layer) {
          map.addLayer(el.layer);
        } else {
          map.removeLayer(el.layer);
        }
      });
    }
  },

  // !!deprecated
  getLayers: function () {
    var baseLayers = [];
    var overlayLayers = [];
    this._layers.forEach(function (info, idx) {
      (info.overlay ? overlayLayers : baseLayers).push({
        layerId: idx,
        name: info.name,
        active: this._map.hasLayer(info.layer)
      });
    }, this);

    return {
      baseLayers: baseLayers,
      overlayLayers: overlayLayers
    };
  }
});

window.LayerChooser = LayerChooser;

function debounce (callback, time) { // https://gist.github.com/nmsdvid/8807205#gistcomment-2641356
  var timeout;
  return function () {
    var context = this;
    var args = arguments;
    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(function () {
      timeout = null;
      callback.apply(context, args);
    }, time);
  };
}

if (typeof android !== 'undefined' && android && android.setLayers) {
  // hook some additional code into the LayerControl so it's easy for the mobile app to interface with it
  LayerChooser.include({
    _setAndroidLayers: debounce(function () { // update layer menu in IITCm
      var l = this.getLayers();
      android.setLayers(JSON.stringify(l.baseLayers), JSON.stringify(l.overlayLayers));
    }, 1000),

    _update: function () {
      this._setAndroidLayers();
      return L.Control.Layers.prototype._update.apply(this, arguments);
    }
  });
}

// contains current status(on/off) of overlay layerGroups.
// !!deprecated: use `map.hasLayer` instead (https://leafletjs.com/reference.html#map-haslayer)
// window.overlayStatus = window.layerChooser._overlayStatus; // to be set in constructor

// Reads recorded layerGroup status (as it may not be added to map yet),
// return `defaultDisplay` if no record found.
// !!deprecated: for most use cases prefer `getLayerByName()` method
// or `map.hasLayer` (https://leafletjs.com/reference.html#map-haslayer)
window.isLayerGroupDisplayed = function (name, defaultDisplay) {
  if (!window.layerChooser) { return; } // to be safe
  return window.layerChooser._isOverlayDisplayed(name, defaultDisplay);
};

window.addLayerGroup = function (name, layerGroup, defaultDisplay) {
  if (defaultDisplay === false) {
    layerGroup.options.defaultDisabled = true;
  }
  layerChooser.addOverlay(layerGroup, name);
}

window.removeLayerGroup = function (layerGroup) {
  var element = layerChooser._layers.find(function (el) {
    return el.layer === layerGroup;
  });
  if (!element) {
    throw new Error('Layer was not found');
  }
  layerChooser.removeLayer(layerGroup);
  map.removeLayer(layerGroup);
};
