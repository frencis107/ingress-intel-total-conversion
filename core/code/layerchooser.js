/*
 * @class LayerChooser
 * @aka window.LayerChooser
 * @inherits L.Controls.Layers
 *
 * Provides 'persistence' of layers display state between sessions.
 *
 * Also some additional methods provided, see below.
 */

'use strict';

var LayerChooser = L.Control.Layers.extend({
  options: {
    // @option sortLayers: Boolean = true
    // Ensures stable sort order (based on initial), while still providing ability
    // to enforce specific order with `addBaseLayer`/`addOverlay`
    // `sortPriority` option.
    sortLayers: true,

    sortFunction: function (layerA, layerB) {
      var a = layerA._chooser.sortPriority;
      var b = layerB._chooser.sortPriority;
      return a < b ? -1 : (b < a ? 1 : 0);
    }
  },

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
    this.lastBaseLayerName = localStorage['iitc-base-map'];
    this._lastPriority = -1000; // initial layers get priority <0
    L.Control.Layers.prototype.initialize.apply(this, arguments);
    this._lastPriority = 0; // any following gets >0
  },

  _addLayer: function (layer, label, overlay, options) {
    options = options || {};
    // stored on first add (with .addBaseLayer/.addOverlay)
    var data = layer._chooser;
    if (!data) {
      data = {
        // name should be unique, otherwise behavior of other methods is undefined
        // (typically: first found will be taken)
        name: label,
        overlay: overlay,
        persistent: 'persistent' in options ? options.persistent : true
      };
      layer._chooser = data;
    } else {
      label = label || data.label || data.name;
    }
    L.Control.Layers.prototype._addLayer.call(this, layer, label, overlay);
    // provide stable sort order
    if ('sortPriority' in options) {
      data.sortPriority = options.sortPriority;
    } else if (!('_sortPriority' in layer)) {
      this._lastPriority = this._lastPriority + 10;
      data.sortPriority = this._lastPriority;
    }
    if (data.overlay) {
      data.default = 'default' in options ? options.default : true;
    }
    var map = this._map || this._mapToAdd;
    if (!data.persistent) {
      if ('enable' in options ? options.enable : data.default) {
        layer.addTo(map);
      }
      return;
    }
    if (overlay) {
      data.statusTracking = function (e) {
        this._storeOverlayState(data.name, e.type === 'add');
      };
      layer.on('add remove', data.statusTracking, this);
      if ('enable' in options) { // do as explicitly specified
        map[options.enable ? 'addLayer' : 'removeLayer'](layer);
      } else if (layer._map) { // already on map, only store state
        this._storeOverlayState(data.name, true);
      } else { // restore at recorded state
        if (this._isOverlayDisplayed(data.name, data.default)) {
          layer.addTo(map);
        }
      }
    } else {
      data.statusTracking = function () {
        localStorage['iitc-base-map'] = data.name;
      };
      layer.on('add', data.statusTracking);
    }
  },

  // @miniclass AddOverlay options (LayerChooser)
  // @aka addOverlay options

  // @option sortPriority: Number = *
  // Enforces specific order in control, lower value means layer's upper position.
  // If not specified - the value will be assigned implicitly in increasing manner.

  // @option persistent: Boolean = true
  // * When `true` (or not specified) - adds overlay to the map as well,
  //   if it's last state was active.
  //   If no record exists then value specified in `default` option is used.
  // * When `false` - overlay status is not tracked, `default` option is honored too.

  // @option default: Boolean = true
  // Default state of overlay (used only when no record about previous state found).

  // @option enable: Boolean
  // Enforce specified state ignoring previously saved.

  // @method addOverlay(layer: L.Layer, name: String, options: AddOverlay options): this
  // Adds an overlay (checkbox entry) with the given name to the control.
  addOverlay: function (layer, name, options) {
    this._addLayer(layer, name, true, options);
    return (this._map) ? this._update() : this;
  },

  // @method removeLayer(layer: Layer|String, keepOnMap?: Boolean): this
  // Removes the given layer from the control.
  // Either layer object or it's name in the control must be specified.
  // Layer is removed from the map as well, except `keepOnMap` argument is true. // todo
  removeLayer: function (layer, options) {
    layer = this.getLayer(layer);
    if (layer) {
      options = options || {};
      var data = layer._chooser;
      if (data.statusTracking) {
        layer.off('add remove', data.statusTracking, this);
        delete data.statusTracking;
      }
      L.Control.Layers.prototype.removeLayer.apply(this, arguments);
      if (this._map && !options.keepOnMap) {//todo doc
        map.removeLayer(layer);
      }
      if (!options.keepData) {//todo doc
        delete layer._chooser;
      }
    } else {
      log.warn('Layer not found');
    }
    return this;
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

  __byName: function (el) {
    var name = this.toString();
    return el.layer._chooser.name === name ||
      el.name === name;
  },

  __byLayer: function (el) {
    return el.layer === this;
  },

  // layer: either Layer or it's name in the control
  _layerInfo: function (layer) {
    var fn = layer instanceof L.Layer
      ? this.__byLayer
      : this.__byName;
    return this._layers.find(fn, layer);
  },

  // @method getLayer(name: String|Layer): Layer
  // Returns layer by it's name in the control, or by layer object itself.
  // The latter can be used to ensure the layer is in layerChooser.
  getLayer: function (layer) {
    var info = this._layerInfo(layer);
    return info && info.layer;
  },

  // @method showLayer(layer: Layer|String|Number, display?: Boolean): this
  // Switches layer's display state to given value (true by default).
  // Layer can be specified also by it's name in the control.
  showLayer: function (layer, display) {
    var info = this._layers[layer]; // layer is index, private use only
    if (info) {
      layer = info.layer;
    } else {
      layer = this.getLayer(layer);
      if (!layer) {
        log.warn('Layer not found');
        return this;
      }
    }
    var map = this._map;
    if (display || arguments.length === 1) {
      if (!map.hasLayer(layer)) {
        if (!layer._chooser.overlay) {
          // if it's a base layer, remove any others
          this._layers.forEach(function (el) {
            if (!el.overlay && el.layer !== layer) {
              map.removeLayer(el.layer);
            }
          });
        }
        map.addLayer(layer);
      }
    } else {
      map.removeLayer(layer);
    }
    return this;
  },

  // @method setLabel(layer: String|Layer, label?): this
  // Sets layers label to specified label text (html),
  // or resets it to original name when label is not specified.
  setLabel: function (layer, label) {
    var fn = layer instanceof L.Layer
      ? this.__byLayer
      : this.__byName;
    var idx = this._layers.findIndex(fn, layer);
    if (idx === -1) {
      log.warn('Layer not found');
      return this;
    }
    var info = this._layers[idx];
    label = label || info.layer._chooser.name;
    info.name = label;
    var nameEl = this._layerControlInputs[idx].closest('label').querySelector('span');
    nameEl.innerHTML = ' ' + label;
    return this;
  },

  _onLongClick: function (idx, originalEvent) {
    var el = this._layers[idx];
    var defaultPrevented;

    // @miniclass LayersControlInteractionEvent (LayerChooser)
    // @inherits Event
    // @property layer: L.Layer
    // The layer that was interacted in LayerChooser control.
    // @property control: LayerChooser
    // LayerChooser control instance (just handy shortcut for window.layerChooser).
    // @property idx: Number
    // Internal index of layer, can be used to address layer in private arrays
    // (`_layers`, `_layerControlInputs`).
    // @property originalEvent: DOMEvent
    // The original mouse/jQuery event that triggered this Leaflet event.
    // @method preventDefault: Function
    // Method to prevent default action of event (like overlays toggling), otherwise handled by layerChooser.
    var obj = {
      control: this,
      idx: idx,
      originalEvent: originalEvent || {type: 'taphold'},
      preventDefault: function () {
        defaultPrevented = true;
        this.defaultPrevented = true;
      }
    };

    // @namespace Layer
    // @section Layers control interaction events
    // Fired when the overlay's label is long-clicked in the layers control.

    // @section Layers control interaction events
    // @event longclick: LayersControlInteractionEvent
    // Fired on layer
    el.layer.fire('longclick', obj);
    if (!defaultPrevented) {
      this._toggleOverlay(idx);
    }
    // @namespace LayerChooser
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
      this._onLongClick(idx, e);
    }.bind(this));
  },

  _filterOverlays: function (el) {
    return el.overlay &&
      ['DEBUG Data Tiles', 'Resistance', 'Enlightened'].indexOf(el.layer._chooser.name) === -1;
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
        if (el.layer._chooser.default) {
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

  _stripHtmlTags: function (str) {
    return str.replace(/(<([^>]+)>)/gi, ''); // https://css-tricks.com/snippets/javascript/strip-html-tags-in-javascript/
  },

  // !!deprecated
  getLayers: function () {
    var baseLayers = [];
    var overlayLayers = [];
    this._layers.forEach(function (info, idx) {
      (info.overlay ? overlayLayers : baseLayers).push({
        layerId: idx,
        name: this._stripHtmlTags(info.name), // IITCm does not support html in layers labels
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

    setLabel: (function (setLabel) {
      return function () {
        this._setAndroidLayers();
        return setLabel.apply(this, arguments);
      };
    })(LayerChooser.prototype.setLabel),

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
// !!deprecated: for most use cases prefer `getLayer()` method
// or `map.hasLayer` (https://leafletjs.com/reference.html#map-haslayer)
window.isLayerGroupDisplayed = function (name, defaultDisplay) {
  if (!window.layerChooser) { return; } // to be safe
  return window.layerChooser._isOverlayDisplayed(name, defaultDisplay);
};

// !!deprecated: use `layerChooser.addOverlay` directly
window.addLayerGroup = function (name, layerGroup, defaultDisplay) {
  var options = {default: defaultDisplay};
  if (arguments.length < 3) { options = undefined; }
  window.layerChooser.addOverlay(layerGroup, name, options);
};

// !!deprecated: use `layerChooser.removeLayer` directly
// our method differs from inherited (https://leafletjs.com/reference.html#control-layers-removelayer),
// as (by default) layer is removed from the map as well, see description for more details.
window.removeLayerGroup = function (layerGroup) {
  window.layerChooser.removeLayer(layerGroup);
};
