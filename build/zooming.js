(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
  typeof define === 'function' && define.amd ? define(factory) :
  (global = global || self, global.Zooming = factory());
}(this, (function () { 'use strict';

  const cursor = {
    default: 'auto',
    zoomIn: 'zoom-in',
    zoomOut: 'zoom-out',
    grab: 'grab',
    move: 'move'
  };

  function listen(el, event, handler, add = true) {
    const options = { passive: false };

    if (add) {
      el.addEventListener(event, handler, options);
    } else {
      el.removeEventListener(event, handler, options);
    }
  }

  function loadImage(src, cb) {
    if (src) {
      const img = new Image();

      img.onload = function onImageLoad() {
        if (cb) cb(img);
      };

      img.src = src;
    }
  }

  function getOriginalSource(el) {
    if (el.dataset.original) {
      return el.dataset.original;
    } else if (el.parentNode.tagName === 'A') {
      return el.parentNode.getAttribute('href');
    } else {
      return null;
    }
  }

  function setStyle(el, styles, remember) {
    if (styles.transition) {
      const value = styles.transition;
      delete styles.transition;
      styles.transition = value;
    }

    if (styles.transform) {
      const value = styles.transform;
      delete styles.transform;
      styles.transform = value;
    }

    let s = el.style;
    let original = {};

    for (let key in styles) {
      if (remember) {
        original[key] = s[key] || '';
      }

      s[key] = styles[key];
    }

    return original;
  }

  function bindAll(_this, that) {
    const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(_this));
    methods.forEach(function bindOne(method) {
      _this[method] = _this[method].bind(that);
    });
  }

  const noop = () => {};

  var DEFAULT_OPTIONS = {
    /**
     * To be able to grab and drag the image for extra zoom-in.
     * @type {boolean}
     */
    enableGrab: true,

    /**
     * Preload zoomable images.
     * @type {boolean}
     */
    preloadImage: false,

    /**
     * Close the zoomed image when browser window is resized.
     * @type {boolean}
     */
    closeOnWindowResize: true,

    /**
     * Transition duration in seconds.
     * @type {number}
     */
    transitionDuration: 0.4,

    /**
     * Transition timing function.
     * @type {string}
     */
    transitionTimingFunction: 'cubic-bezier(0.4, 0, 0, 1)',

    /**
     * Overlay background color.
     * @type {string}
     */
    bgColor: 'rgb(255, 255, 255)',

    /**
     * Overlay background opacity.
     * @type {number}
     */
    bgOpacity: 1,

    /**
     * The base scale factor for zooming. By default scale to fit the window.
     * @type {number}
     */
    scaleBase: 0.5,

    /**
     * The additional scale factor when grabbing the image.
     * @type {number}
     */
    scaleExtra: 2.5,

    /**
     * How much scrolling it takes before closing out.
     * @type {number}
     */
    scrollThreshold: 40,

    /**
     * The z-index that the overlay will be added with.
     * @type {number}
     */
    zIndex: 998,

    /**
     * Scale (zoom in) to given width and height. Ignore scaleBase if set.
     * Alternatively, provide a percentage value relative to the original image size.
     * @type {Object|String}
     * @example
     * customSize: { width: 800, height: 400 }
     * customSize: 100%
     */
    customSize: noop,

    /**
     * A callback function that will be called when a target is opened and
     * transition has ended. It will get the target element as the argument.
     * @type {Function}
     */
    onOpen: noop,

    /**
     * Same as above, except fired when closed.
     * @type {Function}
     */
    onClose: noop,

    /**
     * Same as above, except fired when grabbed.
     * @type {Function}
     */
    onGrab: noop,

    /**
     * Same as above, except fired when moved.
     * @type {Function}
     */
    onMove: noop,

    /**
     * Same as above, except fired when released.
     * @type {Function}
     */
    onRelease: noop,

    /**
     * A callback function that will be called before open.
     * @type {Function}
     */
    onBeforeOpen: noop,

    /**
     * A callback function that will be called before close.
     * @type {Function}
     */
    onBeforeClose: noop,

    /**
     * A callback function that will be called before grab.
     * @type {Function}
     */
    onBeforeGrab: noop,

    /**
     * A callback function that will be called before release.
     * @type {Function}
     */
    onBeforeRelease: noop,

    /**
     * A callback function that will be called when the hi-res image is loading.
     * @type {Function}
     */
    onImageLoading: noop,

    /**
     * A callback function that will be called when the hi-res image is loaded.
     * @type {Function}
     */
    onImageLoaded: noop
  };

  const PRESS_DELAY = 200;

  var handler = {
    init(instance) {
      bindAll(this, instance);
    },

    click(e) {
      e.preventDefault();

      if (isPressingMetaKey(e)) {
        return window.open(this.target.srcOriginal || e.currentTarget.src, '_blank');
      } else {
        if (this.shown) {
          if (this.released) {
            this.close();
          } else {
            this.release();
          }
        } else {
          this.open(e.currentTarget);
        }
      }
    },

    scroll() {
      const el = document.documentElement || document.body.parentNode || document.body;
      const scrollLeft = window.pageXOffset || el.scrollLeft;
      const scrollTop = window.pageYOffset || el.scrollTop;

      if (this.lastScrollPosition === null) {
        this.lastScrollPosition = {
          x: scrollLeft,
          y: scrollTop
        };
      }

      const deltaX = this.lastScrollPosition.x - scrollLeft;
      const deltaY = this.lastScrollPosition.y - scrollTop;
      const threshold = this.options.scrollThreshold;

      if (Math.abs(deltaY) >= threshold || Math.abs(deltaX) >= threshold) {
        this.lastScrollPosition = null;
        this.close();
      }
    },

    keydown(e) {
      if (isEscape(e)) {
        if (this.released) {
          this.close();
        } else {
          this.release(this.close);
        }
      }
    },

    mousedown(e) {
      if (!isLeftButton(e) || isPressingMetaKey(e)) return;
      e.preventDefault();
      const { clientX, clientY } = e;

      this.pressTimer = setTimeout(function grabOnMouseDown() {
        this.grab(clientX, clientY);
      }.bind(this), PRESS_DELAY);
    },

    mousemove(e) {
      if (this.released) return;
      this.move(e.clientX, e.clientY);
    },

    mouseup(e) {
      if (!isLeftButton(e) || isPressingMetaKey(e)) return;
      clearTimeout(this.pressTimer);

      if (this.released) {
        this.close();
      } else {
        this.release();
      }
    },

    touchstart(e) {
      e.preventDefault();
      const { clientX, clientY } = e.touches[0];

      this.pressTimer = setTimeout(function grabOnTouchStart() {
        this.grab(clientX, clientY);
      }.bind(this), PRESS_DELAY);
    },

    touchmove(e) {
      if (this.released) return;

      const { clientX, clientY } = e.touches[0];
      this.move(clientX, clientY);
    },

    touchend(e) {
      if (isTouching(e)) return;
      clearTimeout(this.pressTimer);

      if (this.released) {
        this.close();
      } else {
        this.release();
      }
    },

    clickOverlay() {
      this.close();
    },

    resizeWindow() {
      this.close();
    }
  };

  function isLeftButton(e) {
    return e.button === 0;
  }

  function isPressingMetaKey(e) {
    return e.metaKey || e.ctrlKey;
  }

  function isTouching(e) {
    e.targetTouches.length > 0;
  }

  function isEscape(e) {
    const code = e.key || e.code;
    return code === 'Escape' || e.keyCode === 27;
  }

  var overlay = {
    init(instance) {
      this.el = document.createElement('div');
      this.instance = instance;
      this.parent = document.body;

      setStyle(this.el, {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        opacity: 0
      });

      this.updateStyle(instance.options);
      listen(this.el, 'click', instance.handler.clickOverlay.bind(instance));
    },

    updateStyle(options) {
      setStyle(this.el, {
        zIndex: options.zIndex,
        backgroundColor: options.bgColor,
        transition: `opacity
        ${options.transitionDuration}s
        ${options.transitionTimingFunction}`
      });
    },

    insert() {
      this.parent.appendChild(this.el);
    },

    remove() {
      this.parent.removeChild(this.el);
    },

    fadeIn() {
      this.el.offsetWidth;
      this.el.style.opacity = this.instance.options.bgOpacity;
    },

    fadeOut() {
      this.el.style.opacity = 0;
    }
  };

  // Translate z-axis to fix CSS grid display issue in Chrome:
  // https://github.com/kingdido999/zooming/issues/42
  const TRANSLATE_Z = 0;

  var target = {
    init(el, instance) {
      this.el = el;
      this.instance = instance;
      this.srcThumbnail = this.el.getAttribute('src');
      this.srcset = this.el.getAttribute('srcset');
      this.srcOriginal = getOriginalSource(this.el);
      this.rect = this.el.getBoundingClientRect();
      this.translate = null;
      this.scale = null;
      this.styleOpen = null;
      this.styleClose = null;
    },

    zoomIn() {
      const {
        zIndex,
        enableGrab,
        transitionDuration,
        transitionTimingFunction
      } = this.instance.options;
      this.translate = this.calculateTranslate();
      this.scale = this.calculateScale();

      this.styleOpen = {
        position: 'relative',
        zIndex: zIndex + 1,
        cursor: enableGrab ? cursor.grab : cursor.zoomOut,
        transition: `transform
        ${transitionDuration}s
        ${transitionTimingFunction}`,
        transform: `translate3d(${this.translate.x}px, ${this.translate.y}px, ${TRANSLATE_Z}px)
        scale(${this.scale.x},${this.scale.y})`,
        height: `${this.rect.height}px`,
        width: `${this.rect.width}px`

        // Force layout update
      };this.el.offsetWidth;

      // Trigger transition
      this.styleClose = setStyle(this.el, this.styleOpen, true);
    },

    zoomOut() {
      // Force layout update
      this.el.offsetWidth;

      setStyle(this.el, { transform: 'none' });
    },

    grab(x, y, scaleExtra) {
      const windowCenter = getWindowCenter();
      const [dx, dy] = [windowCenter.x - x, windowCenter.y - y];

      setStyle(this.el, {
        cursor: cursor.move,
        transform: `translate3d(
        ${this.translate.x + dx}px, ${this.translate.y + dy}px, ${TRANSLATE_Z}px)
        scale(${this.scale.x + scaleExtra},${this.scale.y + scaleExtra})`
      });
    },

    move(x, y, scaleExtra) {
      const windowCenter = getWindowCenter();
      const [dx, dy] = [windowCenter.x - x, windowCenter.y - y];

      setStyle(this.el, {
        transition: 'transform',
        transform: `translate3d(
        ${this.translate.x + dx}px, ${this.translate.y + dy}px, ${TRANSLATE_Z}px)
        scale(${this.scale.x + scaleExtra},${this.scale.y + scaleExtra})`
      });
    },

    restoreCloseStyle() {
      setStyle(this.el, this.styleClose);
    },

    restoreOpenStyle() {
      setStyle(this.el, this.styleOpen);
    },

    upgradeSource() {
      if (this.srcOriginal) {
        const parentNode = this.el.parentNode;

        if (this.srcset) {
          this.el.removeAttribute('srcset');
        }

        const temp = this.el.cloneNode(false);

        // Force compute the hi-res image in DOM to prevent
        // image flickering while updating src
        temp.setAttribute('src', this.srcOriginal);
        temp.style.position = 'fixed';
        temp.style.visibility = 'hidden';
        parentNode.appendChild(temp);

        // Add delay to prevent Firefox from flickering
        setTimeout(function updateSrc() {
          this.el.setAttribute('src', this.srcOriginal);
          parentNode.removeChild(temp);
        }.bind(this), 50);
      }
    },

    downgradeSource() {
      if (this.srcOriginal) {
        if (this.srcset) {
          this.el.setAttribute('srcset', this.srcset);
        }
        this.el.setAttribute('src', this.srcThumbnail);
      }
    },

    calculateTranslate() {
      const windowCenter = getWindowCenter();
      const targetCenter = {
        x: this.rect.left + this.rect.width / 2,
        y: this.rect.top + this.rect.height / 2

        // The vector to translate image to the window center
      };return {
        x: windowCenter.x - targetCenter.x,
        y: windowCenter.y - targetCenter.y
      };
    },

    calculateScale() {
      const { zoomingHeight, zoomingWidth } = this.el.dataset;
      const { customSize, scaleBase } = this.instance.options;

      if (!customSize && zoomingHeight && zoomingWidth) {
        return {
          x: zoomingWidth / this.rect.width,
          y: zoomingHeight / this.rect.height
        };
      } else if (customSize && typeof customSize === 'object') {
        return {
          x: customSize.width / this.rect.width,
          y: customSize.height / this.rect.height
        };
      } else {
        const targetHalfWidth = this.rect.width / 2;
        const targetHalfHeight = this.rect.height / 2;
        const windowCenter = getWindowCenter();

        // The distance between target edge and window edge
        const targetEdgeToWindowEdge = {
          x: windowCenter.x - targetHalfWidth,
          y: windowCenter.y - targetHalfHeight
        };

        const scaleHorizontally = targetEdgeToWindowEdge.x / targetHalfWidth;
        const scaleVertically = targetEdgeToWindowEdge.y / targetHalfHeight;

        // The additional scale is based on the smaller value of
        // scaling horizontally and scaling vertically
        const scale = scaleBase + Math.min(scaleHorizontally, scaleVertically);

        if (customSize && typeof customSize === 'string') {
          // Use zoomingWidth and zoomingHeight if available
          const naturalWidth = zoomingWidth || this.el.naturalWidth;
          const naturalHeight = zoomingHeight || this.el.naturalHeight;
          const maxZoomingWidth = parseFloat(customSize) * naturalWidth / (100 * this.rect.width);
          const maxZoomingHeight = parseFloat(customSize) * naturalHeight / (100 * this.rect.height);

          // Only scale image up to the specified customSize percentage
          if (scale > maxZoomingWidth || scale > maxZoomingHeight) {
            return {
              x: maxZoomingWidth,
              y: maxZoomingHeight
            };
          }
        }

        return {
          x: scale,
          y: scale
        };
      }
    }
  };

  function getWindowCenter() {
    const docEl = document.documentElement;
    const windowWidth = Math.min(docEl.clientWidth, window.innerWidth);
    const windowHeight = Math.min(docEl.clientHeight, window.innerHeight);

    return {
      x: windowWidth / 2,
      y: windowHeight / 2
    };
  }

  /**
   * Zooming instance.
   */
  class Zooming {
    /**
     * @param {Object} [options] Update default options if provided.
     */
    constructor(options) {
      this.target = Object.create(target);
      this.overlay = Object.create(overlay);
      this.handler = Object.create(handler);
      this.body = document.body;

      this.shown = false;
      this.lock = false;
      this.released = true;
      this.lastScrollPosition = null;
      this.pressTimer = null;

      this.options = Object.assign({}, DEFAULT_OPTIONS, options);
      this.overlay.init(this);
      this.handler.init(this);
    }

    /**
     * Make element(s) zoomable.
     * @param  {string|Element} el A css selector or an Element.
     * @return {this}
     */
    listen(el) {
      if (typeof el === 'string') {
        const els = document.querySelectorAll(el);
        let i = els.length;

        while (i--) {
          this.listen(els[i]);
        }
      } else if (el.tagName === 'IMG') {
        el.style.cursor = cursor.zoomIn;
        listen(el, 'click', this.handler.click);

        if (this.options.preloadImage) {
          loadImage(getOriginalSource(el));
        }
      }

      return this;
    }

    /**
     * Update options or return current options if no argument is provided.
     * @param  {Object} options An Object that contains this.options.
     * @return {this|this.options}
     */
    config(options) {
      if (options) {
        Object.assign(this.options, options);
        this.overlay.updateStyle(this.options);
        return this;
      } else {
        return this.options;
      }
    }

    /**
     * Open (zoom in) the Element.
     * @param  {Element} el The Element to open.
     * @param  {Function} [cb=this.options.onOpen] A callback function that will
     * be called when a target is opened and transition has ended. It will get
     * the target element as the argument.
     * @return {this}
     */
    open(el, cb = this.options.onOpen) {
      if (this.shown || this.lock) return;

      const target = typeof el === 'string' ? document.querySelector(el) : el;

      if (target.tagName !== 'IMG') return;

      this.options.onBeforeOpen(target);

      this.target.init(target, this);

      if (!this.options.preloadImage) {
        const { srcOriginal } = this.target;

        if (srcOriginal != null) {
          this.options.onImageLoading(target);
          loadImage(srcOriginal, this.options.onImageLoaded);
        }
      }

      this.shown = true;
      this.lock = true;

      this.target.zoomIn();
      this.overlay.insert();
      this.overlay.fadeIn();

      listen(document, 'scroll', this.handler.scroll);
      listen(document, 'keydown', this.handler.keydown);

      if (this.options.closeOnWindowResize) {
        listen(window, 'resize', this.handler.resizeWindow);
      }

      const onOpenEnd = () => {
        listen(target, 'transitionend', onOpenEnd, false);
        this.lock = false;
        this.target.upgradeSource();

        if (this.options.enableGrab) {
          toggleGrabListeners(document, this.handler, true);
        }

        cb(target);
      };

      listen(target, 'transitionend', onOpenEnd);

      return this;
    }

    /**
     * Close (zoom out) the Element currently opened.
     * @param  {Function} [cb=this.options.onClose] A callback function that will
     * be called when a target is closed and transition has ended. It will get
     * the target element as the argument.
     * @return {this}
     */
    close(cb = this.options.onClose) {
      if (!this.shown || this.lock) return;

      const target = this.target.el;

      this.options.onBeforeClose(target);

      this.lock = true;
      this.body.style.cursor = cursor.default;
      this.overlay.fadeOut();
      this.target.zoomOut();

      listen(document, 'scroll', this.handler.scroll, false);
      listen(document, 'keydown', this.handler.keydown, false);

      if (this.options.closeOnWindowResize) {
        listen(window, 'resize', this.handler.resizeWindow, false);
      }

      const onCloseEnd = () => {
        listen(target, 'transitionend', onCloseEnd, false);

        this.shown = false;
        this.lock = false;

        this.target.downgradeSource();

        if (this.options.enableGrab) {
          toggleGrabListeners(document, this.handler, false);
        }

        this.target.restoreCloseStyle();
        this.overlay.remove();

        cb(target);
      };

      listen(target, 'transitionend', onCloseEnd);

      return this;
    }

    /**
     * Grab the Element currently opened given a position and apply extra zoom-in.
     * @param  {number}   x The X-axis of where the press happened.
     * @param  {number}   y The Y-axis of where the press happened.
     * @param  {number}   scaleExtra Extra zoom-in to apply.
     * @param  {Function} [cb=this.options.onGrab] A callback function that
     * will be called when a target is grabbed and transition has ended. It
     * will get the target element as the argument.
     * @return {this}
     */
    grab(x, y, scaleExtra = this.options.scaleExtra, cb = this.options.onGrab) {
      if (!this.shown || this.lock) return;

      const target = this.target.el;

      this.options.onBeforeGrab(target);

      this.released = false;
      this.target.grab(x, y, scaleExtra);

      const onGrabEnd = () => {
        listen(target, 'transitionend', onGrabEnd, false);
        cb(target);
      };

      listen(target, 'transitionend', onGrabEnd);

      return this;
    }

    /**
     * Move the Element currently grabbed given a position and apply extra zoom-in.
     * @param  {number}   x The X-axis of where the press happened.
     * @param  {number}   y The Y-axis of where the press happened.
     * @param  {number}   scaleExtra Extra zoom-in to apply.
     * @param  {Function} [cb=this.options.onMove] A callback function that
     * will be called when a target is moved and transition has ended. It will
     * get the target element as the argument.
     * @return {this}
     */
    move(x, y, scaleExtra = this.options.scaleExtra, cb = this.options.onMove) {
      if (!this.shown || this.lock) return;

      this.released = false;
      this.body.style.cursor = cursor.move;
      this.target.move(x, y, scaleExtra);

      const target = this.target.el;

      const onMoveEnd = () => {
        listen(target, 'transitionend', onMoveEnd, false);
        cb(target);
      };

      listen(target, 'transitionend', onMoveEnd);

      return this;
    }

    /**
     * Release the Element currently grabbed.
     * @param  {Function} [cb=this.options.onRelease] A callback function that
     * will be called when a target is released and transition has ended. It
     * will get the target element as the argument.
     * @return {this}
     */
    release(cb = this.options.onRelease) {
      if (!this.shown || this.lock) return;

      const target = this.target.el;

      this.options.onBeforeRelease(target);

      this.lock = true;
      this.body.style.cursor = cursor.default;
      this.target.restoreOpenStyle();

      const onReleaseEnd = () => {
        listen(target, 'transitionend', onReleaseEnd, false);
        this.lock = false;
        this.released = true;
        cb(target);
      };

      listen(target, 'transitionend', onReleaseEnd);

      return this;
    }
  }

  function toggleGrabListeners(el, handler, add) {
    const types = ['mousedown', 'mousemove', 'mouseup', 'touchstart', 'touchmove', 'touchend'];

    types.forEach(function toggleListener(type) {
      listen(el, type, handler[type], add);
    });
  }

  return Zooming;

})));
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiem9vbWluZy5qcyIsInNvdXJjZXMiOlsiLi4vc3JjL3V0aWxzLmpzIiwiLi4vc3JjL29wdGlvbnMuanMiLCIuLi9zcmMvaGFuZGxlci5qcyIsIi4uL3NyYy9vdmVybGF5LmpzIiwiLi4vc3JjL3RhcmdldC5qcyIsIi4uL3NyYy9pbmRleC5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJleHBvcnQgY29uc3QgY3Vyc29yID0ge1xuICBkZWZhdWx0OiAnYXV0bycsXG4gIHpvb21JbjogJ3pvb20taW4nLFxuICB6b29tT3V0OiAnem9vbS1vdXQnLFxuICBncmFiOiAnZ3JhYicsXG4gIG1vdmU6ICdtb3ZlJ1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbGlzdGVuKGVsLCBldmVudCwgaGFuZGxlciwgYWRkID0gdHJ1ZSkge1xuICBjb25zdCBvcHRpb25zID0geyBwYXNzaXZlOiBmYWxzZSB9XG5cbiAgaWYgKGFkZCkge1xuICAgIGVsLmFkZEV2ZW50TGlzdGVuZXIoZXZlbnQsIGhhbmRsZXIsIG9wdGlvbnMpXG4gIH0gZWxzZSB7XG4gICAgZWwucmVtb3ZlRXZlbnRMaXN0ZW5lcihldmVudCwgaGFuZGxlciwgb3B0aW9ucylcbiAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gbG9hZEltYWdlKHNyYywgY2IpIHtcbiAgaWYgKHNyYykge1xuICAgIGNvbnN0IGltZyA9IG5ldyBJbWFnZSgpXG5cbiAgICBpbWcub25sb2FkID0gZnVuY3Rpb24gb25JbWFnZUxvYWQoKSB7XG4gICAgICBpZiAoY2IpIGNiKGltZylcbiAgICB9XG5cbiAgICBpbWcuc3JjID0gc3JjXG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldE9yaWdpbmFsU291cmNlKGVsKSB7XG4gIGlmIChlbC5kYXRhc2V0Lm9yaWdpbmFsKSB7XG4gICAgcmV0dXJuIGVsLmRhdGFzZXQub3JpZ2luYWxcbiAgfSBlbHNlIGlmIChlbC5wYXJlbnROb2RlLnRhZ05hbWUgPT09ICdBJykge1xuICAgIHJldHVybiBlbC5wYXJlbnROb2RlLmdldEF0dHJpYnV0ZSgnaHJlZicpXG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIG51bGxcbiAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gc2V0U3R5bGUoZWwsIHN0eWxlcywgcmVtZW1iZXIpIHtcbiAgaWYgKHN0eWxlcy50cmFuc2l0aW9uKSB7XG4gICAgY29uc3QgdmFsdWUgPSBzdHlsZXMudHJhbnNpdGlvblxuICAgIGRlbGV0ZSBzdHlsZXMudHJhbnNpdGlvblxuICAgIHN0eWxlcy50cmFuc2l0aW9uID0gdmFsdWVcbiAgfVxuXG4gIGlmIChzdHlsZXMudHJhbnNmb3JtKSB7XG4gICAgY29uc3QgdmFsdWUgPSBzdHlsZXMudHJhbnNmb3JtXG4gICAgZGVsZXRlIHN0eWxlcy50cmFuc2Zvcm1cbiAgICBzdHlsZXMudHJhbnNmb3JtID0gdmFsdWVcbiAgfVxuXG4gIGxldCBzID0gZWwuc3R5bGVcbiAgbGV0IG9yaWdpbmFsID0ge31cblxuICBmb3IgKGxldCBrZXkgaW4gc3R5bGVzKSB7XG4gICAgaWYgKHJlbWVtYmVyKSB7XG4gICAgICBvcmlnaW5hbFtrZXldID0gc1trZXldIHx8ICcnXG4gICAgfVxuXG4gICAgc1trZXldID0gc3R5bGVzW2tleV1cbiAgfVxuXG4gIHJldHVybiBvcmlnaW5hbFxufVxuXG5leHBvcnQgZnVuY3Rpb24gYmluZEFsbChfdGhpcywgdGhhdCkge1xuICBjb25zdCBtZXRob2RzID0gT2JqZWN0LmdldE93blByb3BlcnR5TmFtZXMoT2JqZWN0LmdldFByb3RvdHlwZU9mKF90aGlzKSlcbiAgbWV0aG9kcy5mb3JFYWNoKGZ1bmN0aW9uIGJpbmRPbmUobWV0aG9kKSB7XG4gICAgX3RoaXNbbWV0aG9kXSA9IF90aGlzW21ldGhvZF0uYmluZCh0aGF0KVxuICB9KVxufVxuIiwiY29uc3Qgbm9vcCA9ICgpID0+IHt9XG5cbmV4cG9ydCBkZWZhdWx0IHtcbiAgLyoqXG4gICAqIFRvIGJlIGFibGUgdG8gZ3JhYiBhbmQgZHJhZyB0aGUgaW1hZ2UgZm9yIGV4dHJhIHpvb20taW4uXG4gICAqIEB0eXBlIHtib29sZWFufVxuICAgKi9cbiAgZW5hYmxlR3JhYjogdHJ1ZSxcblxuICAvKipcbiAgICogUHJlbG9hZCB6b29tYWJsZSBpbWFnZXMuXG4gICAqIEB0eXBlIHtib29sZWFufVxuICAgKi9cbiAgcHJlbG9hZEltYWdlOiBmYWxzZSxcblxuICAvKipcbiAgICogQ2xvc2UgdGhlIHpvb21lZCBpbWFnZSB3aGVuIGJyb3dzZXIgd2luZG93IGlzIHJlc2l6ZWQuXG4gICAqIEB0eXBlIHtib29sZWFufVxuICAgKi9cbiAgY2xvc2VPbldpbmRvd1Jlc2l6ZTogdHJ1ZSxcblxuICAvKipcbiAgICogVHJhbnNpdGlvbiBkdXJhdGlvbiBpbiBzZWNvbmRzLlxuICAgKiBAdHlwZSB7bnVtYmVyfVxuICAgKi9cbiAgdHJhbnNpdGlvbkR1cmF0aW9uOiAwLjQsXG5cbiAgLyoqXG4gICAqIFRyYW5zaXRpb24gdGltaW5nIGZ1bmN0aW9uLlxuICAgKiBAdHlwZSB7c3RyaW5nfVxuICAgKi9cbiAgdHJhbnNpdGlvblRpbWluZ0Z1bmN0aW9uOiAnY3ViaWMtYmV6aWVyKDAuNCwgMCwgMCwgMSknLFxuXG4gIC8qKlxuICAgKiBPdmVybGF5IGJhY2tncm91bmQgY29sb3IuXG4gICAqIEB0eXBlIHtzdHJpbmd9XG4gICAqL1xuICBiZ0NvbG9yOiAncmdiKDI1NSwgMjU1LCAyNTUpJyxcblxuICAvKipcbiAgICogT3ZlcmxheSBiYWNrZ3JvdW5kIG9wYWNpdHkuXG4gICAqIEB0eXBlIHtudW1iZXJ9XG4gICAqL1xuICBiZ09wYWNpdHk6IDEsXG5cbiAgLyoqXG4gICAqIFRoZSBiYXNlIHNjYWxlIGZhY3RvciBmb3Igem9vbWluZy4gQnkgZGVmYXVsdCBzY2FsZSB0byBmaXQgdGhlIHdpbmRvdy5cbiAgICogQHR5cGUge251bWJlcn1cbiAgICovXG4gIHNjYWxlQmFzZTogMC41LFxuXG4gIC8qKlxuICAgKiBUaGUgYWRkaXRpb25hbCBzY2FsZSBmYWN0b3Igd2hlbiBncmFiYmluZyB0aGUgaW1hZ2UuXG4gICAqIEB0eXBlIHtudW1iZXJ9XG4gICAqL1xuICBzY2FsZUV4dHJhOiAyLjUsXG5cbiAgLyoqXG4gICAqIEhvdyBtdWNoIHNjcm9sbGluZyBpdCB0YWtlcyBiZWZvcmUgY2xvc2luZyBvdXQuXG4gICAqIEB0eXBlIHtudW1iZXJ9XG4gICAqL1xuICBzY3JvbGxUaHJlc2hvbGQ6IDQwLFxuXG4gIC8qKlxuICAgKiBUaGUgei1pbmRleCB0aGF0IHRoZSBvdmVybGF5IHdpbGwgYmUgYWRkZWQgd2l0aC5cbiAgICogQHR5cGUge251bWJlcn1cbiAgICovXG4gIHpJbmRleDogOTk4LFxuXG4gIC8qKlxuICAgKiBTY2FsZSAoem9vbSBpbikgdG8gZ2l2ZW4gd2lkdGggYW5kIGhlaWdodC4gSWdub3JlIHNjYWxlQmFzZSBpZiBzZXQuXG4gICAqIEFsdGVybmF0aXZlbHksIHByb3ZpZGUgYSBwZXJjZW50YWdlIHZhbHVlIHJlbGF0aXZlIHRvIHRoZSBvcmlnaW5hbCBpbWFnZSBzaXplLlxuICAgKiBAdHlwZSB7T2JqZWN0fFN0cmluZ31cbiAgICogQGV4YW1wbGVcbiAgICogY3VzdG9tU2l6ZTogeyB3aWR0aDogODAwLCBoZWlnaHQ6IDQwMCB9XG4gICAqIGN1c3RvbVNpemU6IDEwMCVcbiAgICovXG4gIGN1c3RvbVNpemU6IG5vb3AsXG5cbiAgLyoqXG4gICAqIEEgY2FsbGJhY2sgZnVuY3Rpb24gdGhhdCB3aWxsIGJlIGNhbGxlZCB3aGVuIGEgdGFyZ2V0IGlzIG9wZW5lZCBhbmRcbiAgICogdHJhbnNpdGlvbiBoYXMgZW5kZWQuIEl0IHdpbGwgZ2V0IHRoZSB0YXJnZXQgZWxlbWVudCBhcyB0aGUgYXJndW1lbnQuXG4gICAqIEB0eXBlIHtGdW5jdGlvbn1cbiAgICovXG4gIG9uT3Blbjogbm9vcCxcblxuICAvKipcbiAgICogU2FtZSBhcyBhYm92ZSwgZXhjZXB0IGZpcmVkIHdoZW4gY2xvc2VkLlxuICAgKiBAdHlwZSB7RnVuY3Rpb259XG4gICAqL1xuICBvbkNsb3NlOiBub29wLFxuXG4gIC8qKlxuICAgKiBTYW1lIGFzIGFib3ZlLCBleGNlcHQgZmlyZWQgd2hlbiBncmFiYmVkLlxuICAgKiBAdHlwZSB7RnVuY3Rpb259XG4gICAqL1xuICBvbkdyYWI6IG5vb3AsXG5cbiAgLyoqXG4gICAqIFNhbWUgYXMgYWJvdmUsIGV4Y2VwdCBmaXJlZCB3aGVuIG1vdmVkLlxuICAgKiBAdHlwZSB7RnVuY3Rpb259XG4gICAqL1xuICBvbk1vdmU6IG5vb3AsXG5cbiAgLyoqXG4gICAqIFNhbWUgYXMgYWJvdmUsIGV4Y2VwdCBmaXJlZCB3aGVuIHJlbGVhc2VkLlxuICAgKiBAdHlwZSB7RnVuY3Rpb259XG4gICAqL1xuICBvblJlbGVhc2U6IG5vb3AsXG5cbiAgLyoqXG4gICAqIEEgY2FsbGJhY2sgZnVuY3Rpb24gdGhhdCB3aWxsIGJlIGNhbGxlZCBiZWZvcmUgb3Blbi5cbiAgICogQHR5cGUge0Z1bmN0aW9ufVxuICAgKi9cbiAgb25CZWZvcmVPcGVuOiBub29wLFxuXG4gIC8qKlxuICAgKiBBIGNhbGxiYWNrIGZ1bmN0aW9uIHRoYXQgd2lsbCBiZSBjYWxsZWQgYmVmb3JlIGNsb3NlLlxuICAgKiBAdHlwZSB7RnVuY3Rpb259XG4gICAqL1xuICBvbkJlZm9yZUNsb3NlOiBub29wLFxuXG4gIC8qKlxuICAgKiBBIGNhbGxiYWNrIGZ1bmN0aW9uIHRoYXQgd2lsbCBiZSBjYWxsZWQgYmVmb3JlIGdyYWIuXG4gICAqIEB0eXBlIHtGdW5jdGlvbn1cbiAgICovXG4gIG9uQmVmb3JlR3JhYjogbm9vcCxcblxuICAvKipcbiAgICogQSBjYWxsYmFjayBmdW5jdGlvbiB0aGF0IHdpbGwgYmUgY2FsbGVkIGJlZm9yZSByZWxlYXNlLlxuICAgKiBAdHlwZSB7RnVuY3Rpb259XG4gICAqL1xuICBvbkJlZm9yZVJlbGVhc2U6IG5vb3AsXG5cbiAgLyoqXG4gICAqIEEgY2FsbGJhY2sgZnVuY3Rpb24gdGhhdCB3aWxsIGJlIGNhbGxlZCB3aGVuIHRoZSBoaS1yZXMgaW1hZ2UgaXMgbG9hZGluZy5cbiAgICogQHR5cGUge0Z1bmN0aW9ufVxuICAgKi9cbiAgb25JbWFnZUxvYWRpbmc6IG5vb3AsXG5cbiAgLyoqXG4gICAqIEEgY2FsbGJhY2sgZnVuY3Rpb24gdGhhdCB3aWxsIGJlIGNhbGxlZCB3aGVuIHRoZSBoaS1yZXMgaW1hZ2UgaXMgbG9hZGVkLlxuICAgKiBAdHlwZSB7RnVuY3Rpb259XG4gICAqL1xuICBvbkltYWdlTG9hZGVkOiBub29wXG59XG4iLCJpbXBvcnQgeyBiaW5kQWxsIH0gZnJvbSAnLi91dGlscydcblxuY29uc3QgUFJFU1NfREVMQVkgPSAyMDBcblxuZXhwb3J0IGRlZmF1bHQge1xuICBpbml0KGluc3RhbmNlKSB7XG4gICAgYmluZEFsbCh0aGlzLCBpbnN0YW5jZSlcbiAgfSxcblxuICBjbGljayhlKSB7XG4gICAgZS5wcmV2ZW50RGVmYXVsdCgpXG5cbiAgICBpZiAoaXNQcmVzc2luZ01ldGFLZXkoZSkpIHtcbiAgICAgIHJldHVybiB3aW5kb3cub3BlbihcbiAgICAgICAgdGhpcy50YXJnZXQuc3JjT3JpZ2luYWwgfHwgZS5jdXJyZW50VGFyZ2V0LnNyYyxcbiAgICAgICAgJ19ibGFuaydcbiAgICAgIClcbiAgICB9IGVsc2Uge1xuICAgICAgaWYgKHRoaXMuc2hvd24pIHtcbiAgICAgICAgaWYgKHRoaXMucmVsZWFzZWQpIHtcbiAgICAgICAgICB0aGlzLmNsb3NlKClcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0aGlzLnJlbGVhc2UoKVxuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aGlzLm9wZW4oZS5jdXJyZW50VGFyZ2V0KVxuICAgICAgfVxuICAgIH1cbiAgfSxcblxuICBzY3JvbGwoKSB7XG4gICAgY29uc3QgZWwgPVxuICAgICAgZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50IHx8IGRvY3VtZW50LmJvZHkucGFyZW50Tm9kZSB8fCBkb2N1bWVudC5ib2R5XG4gICAgY29uc3Qgc2Nyb2xsTGVmdCA9IHdpbmRvdy5wYWdlWE9mZnNldCB8fCBlbC5zY3JvbGxMZWZ0XG4gICAgY29uc3Qgc2Nyb2xsVG9wID0gd2luZG93LnBhZ2VZT2Zmc2V0IHx8IGVsLnNjcm9sbFRvcFxuXG4gICAgaWYgKHRoaXMubGFzdFNjcm9sbFBvc2l0aW9uID09PSBudWxsKSB7XG4gICAgICB0aGlzLmxhc3RTY3JvbGxQb3NpdGlvbiA9IHtcbiAgICAgICAgeDogc2Nyb2xsTGVmdCxcbiAgICAgICAgeTogc2Nyb2xsVG9wXG4gICAgICB9XG4gICAgfVxuXG4gICAgY29uc3QgZGVsdGFYID0gdGhpcy5sYXN0U2Nyb2xsUG9zaXRpb24ueCAtIHNjcm9sbExlZnRcbiAgICBjb25zdCBkZWx0YVkgPSB0aGlzLmxhc3RTY3JvbGxQb3NpdGlvbi55IC0gc2Nyb2xsVG9wXG4gICAgY29uc3QgdGhyZXNob2xkID0gdGhpcy5vcHRpb25zLnNjcm9sbFRocmVzaG9sZFxuXG4gICAgaWYgKE1hdGguYWJzKGRlbHRhWSkgPj0gdGhyZXNob2xkIHx8IE1hdGguYWJzKGRlbHRhWCkgPj0gdGhyZXNob2xkKSB7XG4gICAgICB0aGlzLmxhc3RTY3JvbGxQb3NpdGlvbiA9IG51bGxcbiAgICAgIHRoaXMuY2xvc2UoKVxuICAgIH1cbiAgfSxcblxuICBrZXlkb3duKGUpIHtcbiAgICBpZiAoaXNFc2NhcGUoZSkpIHtcbiAgICAgIGlmICh0aGlzLnJlbGVhc2VkKSB7XG4gICAgICAgIHRoaXMuY2xvc2UoKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGhpcy5yZWxlYXNlKHRoaXMuY2xvc2UpXG4gICAgICB9XG4gICAgfVxuICB9LFxuXG4gIG1vdXNlZG93bihlKSB7XG4gICAgaWYgKCFpc0xlZnRCdXR0b24oZSkgfHwgaXNQcmVzc2luZ01ldGFLZXkoZSkpIHJldHVyblxuICAgIGUucHJldmVudERlZmF1bHQoKVxuICAgIGNvbnN0IHsgY2xpZW50WCwgY2xpZW50WSB9ID0gZVxuXG4gICAgdGhpcy5wcmVzc1RpbWVyID0gc2V0VGltZW91dChcbiAgICAgIGZ1bmN0aW9uIGdyYWJPbk1vdXNlRG93bigpIHtcbiAgICAgICAgdGhpcy5ncmFiKGNsaWVudFgsIGNsaWVudFkpXG4gICAgICB9LmJpbmQodGhpcyksXG4gICAgICBQUkVTU19ERUxBWVxuICAgIClcbiAgfSxcblxuICBtb3VzZW1vdmUoZSkge1xuICAgIGlmICh0aGlzLnJlbGVhc2VkKSByZXR1cm5cbiAgICB0aGlzLm1vdmUoZS5jbGllbnRYLCBlLmNsaWVudFkpXG4gIH0sXG5cbiAgbW91c2V1cChlKSB7XG4gICAgaWYgKCFpc0xlZnRCdXR0b24oZSkgfHwgaXNQcmVzc2luZ01ldGFLZXkoZSkpIHJldHVyblxuICAgIGNsZWFyVGltZW91dCh0aGlzLnByZXNzVGltZXIpXG5cbiAgICBpZiAodGhpcy5yZWxlYXNlZCkge1xuICAgICAgdGhpcy5jbG9zZSgpXG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMucmVsZWFzZSgpXG4gICAgfVxuICB9LFxuXG4gIHRvdWNoc3RhcnQoZSkge1xuICAgIGUucHJldmVudERlZmF1bHQoKVxuICAgIGNvbnN0IHsgY2xpZW50WCwgY2xpZW50WSB9ID0gZS50b3VjaGVzWzBdXG5cbiAgICB0aGlzLnByZXNzVGltZXIgPSBzZXRUaW1lb3V0KFxuICAgICAgZnVuY3Rpb24gZ3JhYk9uVG91Y2hTdGFydCgpIHtcbiAgICAgICAgdGhpcy5ncmFiKGNsaWVudFgsIGNsaWVudFkpXG4gICAgICB9LmJpbmQodGhpcyksXG4gICAgICBQUkVTU19ERUxBWVxuICAgIClcbiAgfSxcblxuICB0b3VjaG1vdmUoZSkge1xuICAgIGlmICh0aGlzLnJlbGVhc2VkKSByZXR1cm5cblxuICAgIGNvbnN0IHsgY2xpZW50WCwgY2xpZW50WSB9ID0gZS50b3VjaGVzWzBdXG4gICAgdGhpcy5tb3ZlKGNsaWVudFgsIGNsaWVudFkpXG4gIH0sXG5cbiAgdG91Y2hlbmQoZSkge1xuICAgIGlmIChpc1RvdWNoaW5nKGUpKSByZXR1cm5cbiAgICBjbGVhclRpbWVvdXQodGhpcy5wcmVzc1RpbWVyKVxuXG4gICAgaWYgKHRoaXMucmVsZWFzZWQpIHtcbiAgICAgIHRoaXMuY2xvc2UoKVxuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLnJlbGVhc2UoKVxuICAgIH1cbiAgfSxcblxuICBjbGlja092ZXJsYXkoKSB7XG4gICAgdGhpcy5jbG9zZSgpXG4gIH0sXG5cbiAgcmVzaXplV2luZG93KCkge1xuICAgIHRoaXMuY2xvc2UoKVxuICB9XG59XG5cbmZ1bmN0aW9uIGlzTGVmdEJ1dHRvbihlKSB7XG4gIHJldHVybiBlLmJ1dHRvbiA9PT0gMFxufVxuXG5mdW5jdGlvbiBpc1ByZXNzaW5nTWV0YUtleShlKSB7XG4gIHJldHVybiBlLm1ldGFLZXkgfHwgZS5jdHJsS2V5XG59XG5cbmZ1bmN0aW9uIGlzVG91Y2hpbmcoZSkge1xuICBlLnRhcmdldFRvdWNoZXMubGVuZ3RoID4gMFxufVxuXG5mdW5jdGlvbiBpc0VzY2FwZShlKSB7XG4gIGNvbnN0IGNvZGUgPSBlLmtleSB8fCBlLmNvZGVcbiAgcmV0dXJuIGNvZGUgPT09ICdFc2NhcGUnIHx8IGUua2V5Q29kZSA9PT0gMjdcbn1cbiIsImltcG9ydCB7IGxpc3Rlbiwgc2V0U3R5bGUgfSBmcm9tICcuL3V0aWxzJ1xuXG5leHBvcnQgZGVmYXVsdCB7XG4gIGluaXQoaW5zdGFuY2UpIHtcbiAgICB0aGlzLmVsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2JylcbiAgICB0aGlzLmluc3RhbmNlID0gaW5zdGFuY2VcbiAgICB0aGlzLnBhcmVudCA9IGRvY3VtZW50LmJvZHlcblxuICAgIHNldFN0eWxlKHRoaXMuZWwsIHtcbiAgICAgIHBvc2l0aW9uOiAnZml4ZWQnLFxuICAgICAgdG9wOiAwLFxuICAgICAgbGVmdDogMCxcbiAgICAgIHJpZ2h0OiAwLFxuICAgICAgYm90dG9tOiAwLFxuICAgICAgb3BhY2l0eTogMFxuICAgIH0pXG5cbiAgICB0aGlzLnVwZGF0ZVN0eWxlKGluc3RhbmNlLm9wdGlvbnMpXG4gICAgbGlzdGVuKHRoaXMuZWwsICdjbGljaycsIGluc3RhbmNlLmhhbmRsZXIuY2xpY2tPdmVybGF5LmJpbmQoaW5zdGFuY2UpKVxuICB9LFxuXG4gIHVwZGF0ZVN0eWxlKG9wdGlvbnMpIHtcbiAgICBzZXRTdHlsZSh0aGlzLmVsLCB7XG4gICAgICB6SW5kZXg6IG9wdGlvbnMuekluZGV4LFxuICAgICAgYmFja2dyb3VuZENvbG9yOiBvcHRpb25zLmJnQ29sb3IsXG4gICAgICB0cmFuc2l0aW9uOiBgb3BhY2l0eVxuICAgICAgICAke29wdGlvbnMudHJhbnNpdGlvbkR1cmF0aW9ufXNcbiAgICAgICAgJHtvcHRpb25zLnRyYW5zaXRpb25UaW1pbmdGdW5jdGlvbn1gXG4gICAgfSlcbiAgfSxcblxuICBpbnNlcnQoKSB7XG4gICAgdGhpcy5wYXJlbnQuYXBwZW5kQ2hpbGQodGhpcy5lbClcbiAgfSxcblxuICByZW1vdmUoKSB7XG4gICAgdGhpcy5wYXJlbnQucmVtb3ZlQ2hpbGQodGhpcy5lbClcbiAgfSxcblxuICBmYWRlSW4oKSB7XG4gICAgdGhpcy5lbC5vZmZzZXRXaWR0aFxuICAgIHRoaXMuZWwuc3R5bGUub3BhY2l0eSA9IHRoaXMuaW5zdGFuY2Uub3B0aW9ucy5iZ09wYWNpdHlcbiAgfSxcblxuICBmYWRlT3V0KCkge1xuICAgIHRoaXMuZWwuc3R5bGUub3BhY2l0eSA9IDBcbiAgfVxufVxuIiwiaW1wb3J0IHsgY3Vyc29yLCBzZXRTdHlsZSwgZ2V0T3JpZ2luYWxTb3VyY2UgfSBmcm9tICcuL3V0aWxzJ1xuXG4vLyBUcmFuc2xhdGUgei1heGlzIHRvIGZpeCBDU1MgZ3JpZCBkaXNwbGF5IGlzc3VlIGluIENocm9tZTpcbi8vIGh0dHBzOi8vZ2l0aHViLmNvbS9raW5nZGlkbzk5OS96b29taW5nL2lzc3Vlcy80MlxuY29uc3QgVFJBTlNMQVRFX1ogPSAwXG5cbmV4cG9ydCBkZWZhdWx0IHtcbiAgaW5pdChlbCwgaW5zdGFuY2UpIHtcbiAgICB0aGlzLmVsID0gZWxcbiAgICB0aGlzLmluc3RhbmNlID0gaW5zdGFuY2VcbiAgICB0aGlzLnNyY1RodW1ibmFpbCA9IHRoaXMuZWwuZ2V0QXR0cmlidXRlKCdzcmMnKVxuICAgIHRoaXMuc3Jjc2V0ID0gdGhpcy5lbC5nZXRBdHRyaWJ1dGUoJ3NyY3NldCcpXG4gICAgdGhpcy5zcmNPcmlnaW5hbCA9IGdldE9yaWdpbmFsU291cmNlKHRoaXMuZWwpXG4gICAgdGhpcy5yZWN0ID0gdGhpcy5lbC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKVxuICAgIHRoaXMudHJhbnNsYXRlID0gbnVsbFxuICAgIHRoaXMuc2NhbGUgPSBudWxsXG4gICAgdGhpcy5zdHlsZU9wZW4gPSBudWxsXG4gICAgdGhpcy5zdHlsZUNsb3NlID0gbnVsbFxuICB9LFxuXG4gIHpvb21JbigpIHtcbiAgICBjb25zdCB7XG4gICAgICB6SW5kZXgsXG4gICAgICBlbmFibGVHcmFiLFxuICAgICAgdHJhbnNpdGlvbkR1cmF0aW9uLFxuICAgICAgdHJhbnNpdGlvblRpbWluZ0Z1bmN0aW9uXG4gICAgfSA9IHRoaXMuaW5zdGFuY2Uub3B0aW9uc1xuICAgIHRoaXMudHJhbnNsYXRlID0gdGhpcy5jYWxjdWxhdGVUcmFuc2xhdGUoKVxuICAgIHRoaXMuc2NhbGUgPSB0aGlzLmNhbGN1bGF0ZVNjYWxlKClcblxuICAgIHRoaXMuc3R5bGVPcGVuID0ge1xuICAgICAgcG9zaXRpb246ICdyZWxhdGl2ZScsXG4gICAgICB6SW5kZXg6IHpJbmRleCArIDEsXG4gICAgICBjdXJzb3I6IGVuYWJsZUdyYWIgPyBjdXJzb3IuZ3JhYiA6IGN1cnNvci56b29tT3V0LFxuICAgICAgdHJhbnNpdGlvbjogYHRyYW5zZm9ybVxuICAgICAgICAke3RyYW5zaXRpb25EdXJhdGlvbn1zXG4gICAgICAgICR7dHJhbnNpdGlvblRpbWluZ0Z1bmN0aW9ufWAsXG4gICAgICB0cmFuc2Zvcm06IGB0cmFuc2xhdGUzZCgke3RoaXMudHJhbnNsYXRlLnh9cHgsICR7XG4gICAgICAgIHRoaXMudHJhbnNsYXRlLnlcbiAgICAgIH1weCwgJHtUUkFOU0xBVEVfWn1weClcbiAgICAgICAgc2NhbGUoJHt0aGlzLnNjYWxlLnh9LCR7dGhpcy5zY2FsZS55fSlgLFxuICAgICAgaGVpZ2h0OiBgJHt0aGlzLnJlY3QuaGVpZ2h0fXB4YCxcbiAgICAgIHdpZHRoOiBgJHt0aGlzLnJlY3Qud2lkdGh9cHhgXG4gICAgfVxuXG4gICAgLy8gRm9yY2UgbGF5b3V0IHVwZGF0ZVxuICAgIHRoaXMuZWwub2Zmc2V0V2lkdGhcblxuICAgIC8vIFRyaWdnZXIgdHJhbnNpdGlvblxuICAgIHRoaXMuc3R5bGVDbG9zZSA9IHNldFN0eWxlKHRoaXMuZWwsIHRoaXMuc3R5bGVPcGVuLCB0cnVlKVxuICB9LFxuXG4gIHpvb21PdXQoKSB7XG4gICAgLy8gRm9yY2UgbGF5b3V0IHVwZGF0ZVxuICAgIHRoaXMuZWwub2Zmc2V0V2lkdGhcblxuICAgIHNldFN0eWxlKHRoaXMuZWwsIHsgdHJhbnNmb3JtOiAnbm9uZScgfSlcbiAgfSxcblxuICBncmFiKHgsIHksIHNjYWxlRXh0cmEpIHtcbiAgICBjb25zdCB3aW5kb3dDZW50ZXIgPSBnZXRXaW5kb3dDZW50ZXIoKVxuICAgIGNvbnN0IFtkeCwgZHldID0gW3dpbmRvd0NlbnRlci54IC0geCwgd2luZG93Q2VudGVyLnkgLSB5XVxuXG4gICAgc2V0U3R5bGUodGhpcy5lbCwge1xuICAgICAgY3Vyc29yOiBjdXJzb3IubW92ZSxcbiAgICAgIHRyYW5zZm9ybTogYHRyYW5zbGF0ZTNkKFxuICAgICAgICAke3RoaXMudHJhbnNsYXRlLnggKyBkeH1weCwgJHt0aGlzLnRyYW5zbGF0ZS55ICtcbiAgICAgICAgZHl9cHgsICR7VFJBTlNMQVRFX1p9cHgpXG4gICAgICAgIHNjYWxlKCR7dGhpcy5zY2FsZS54ICsgc2NhbGVFeHRyYX0sJHt0aGlzLnNjYWxlLnkgKyBzY2FsZUV4dHJhfSlgXG4gICAgfSlcbiAgfSxcblxuICBtb3ZlKHgsIHksIHNjYWxlRXh0cmEpIHtcbiAgICBjb25zdCB3aW5kb3dDZW50ZXIgPSBnZXRXaW5kb3dDZW50ZXIoKVxuICAgIGNvbnN0IFtkeCwgZHldID0gW3dpbmRvd0NlbnRlci54IC0geCwgd2luZG93Q2VudGVyLnkgLSB5XVxuXG4gICAgc2V0U3R5bGUodGhpcy5lbCwge1xuICAgICAgdHJhbnNpdGlvbjogJ3RyYW5zZm9ybScsXG4gICAgICB0cmFuc2Zvcm06IGB0cmFuc2xhdGUzZChcbiAgICAgICAgJHt0aGlzLnRyYW5zbGF0ZS54ICsgZHh9cHgsICR7dGhpcy50cmFuc2xhdGUueSArXG4gICAgICAgIGR5fXB4LCAke1RSQU5TTEFURV9afXB4KVxuICAgICAgICBzY2FsZSgke3RoaXMuc2NhbGUueCArIHNjYWxlRXh0cmF9LCR7dGhpcy5zY2FsZS55ICsgc2NhbGVFeHRyYX0pYFxuICAgIH0pXG4gIH0sXG5cbiAgcmVzdG9yZUNsb3NlU3R5bGUoKSB7XG4gICAgc2V0U3R5bGUodGhpcy5lbCwgdGhpcy5zdHlsZUNsb3NlKVxuICB9LFxuXG4gIHJlc3RvcmVPcGVuU3R5bGUoKSB7XG4gICAgc2V0U3R5bGUodGhpcy5lbCwgdGhpcy5zdHlsZU9wZW4pXG4gIH0sXG5cbiAgdXBncmFkZVNvdXJjZSgpIHtcbiAgICBpZiAodGhpcy5zcmNPcmlnaW5hbCkge1xuICAgICAgY29uc3QgcGFyZW50Tm9kZSA9IHRoaXMuZWwucGFyZW50Tm9kZVxuXG4gICAgICBpZiAodGhpcy5zcmNzZXQpIHtcbiAgICAgICAgdGhpcy5lbC5yZW1vdmVBdHRyaWJ1dGUoJ3NyY3NldCcpXG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHRlbXAgPSB0aGlzLmVsLmNsb25lTm9kZShmYWxzZSlcblxuICAgICAgLy8gRm9yY2UgY29tcHV0ZSB0aGUgaGktcmVzIGltYWdlIGluIERPTSB0byBwcmV2ZW50XG4gICAgICAvLyBpbWFnZSBmbGlja2VyaW5nIHdoaWxlIHVwZGF0aW5nIHNyY1xuICAgICAgdGVtcC5zZXRBdHRyaWJ1dGUoJ3NyYycsIHRoaXMuc3JjT3JpZ2luYWwpXG4gICAgICB0ZW1wLnN0eWxlLnBvc2l0aW9uID0gJ2ZpeGVkJ1xuICAgICAgdGVtcC5zdHlsZS52aXNpYmlsaXR5ID0gJ2hpZGRlbidcbiAgICAgIHBhcmVudE5vZGUuYXBwZW5kQ2hpbGQodGVtcClcblxuICAgICAgLy8gQWRkIGRlbGF5IHRvIHByZXZlbnQgRmlyZWZveCBmcm9tIGZsaWNrZXJpbmdcbiAgICAgIHNldFRpbWVvdXQoXG4gICAgICAgIGZ1bmN0aW9uIHVwZGF0ZVNyYygpIHtcbiAgICAgICAgICB0aGlzLmVsLnNldEF0dHJpYnV0ZSgnc3JjJywgdGhpcy5zcmNPcmlnaW5hbClcbiAgICAgICAgICBwYXJlbnROb2RlLnJlbW92ZUNoaWxkKHRlbXApXG4gICAgICAgIH0uYmluZCh0aGlzKSxcbiAgICAgICAgNTBcbiAgICAgIClcbiAgICB9XG4gIH0sXG5cbiAgZG93bmdyYWRlU291cmNlKCkge1xuICAgIGlmICh0aGlzLnNyY09yaWdpbmFsKSB7XG4gICAgICBpZiAodGhpcy5zcmNzZXQpIHtcbiAgICAgICAgdGhpcy5lbC5zZXRBdHRyaWJ1dGUoJ3NyY3NldCcsIHRoaXMuc3Jjc2V0KVxuICAgICAgfVxuICAgICAgdGhpcy5lbC5zZXRBdHRyaWJ1dGUoJ3NyYycsIHRoaXMuc3JjVGh1bWJuYWlsKVxuICAgIH1cbiAgfSxcblxuICBjYWxjdWxhdGVUcmFuc2xhdGUoKSB7XG4gICAgY29uc3Qgd2luZG93Q2VudGVyID0gZ2V0V2luZG93Q2VudGVyKClcbiAgICBjb25zdCB0YXJnZXRDZW50ZXIgPSB7XG4gICAgICB4OiB0aGlzLnJlY3QubGVmdCArIHRoaXMucmVjdC53aWR0aCAvIDIsXG4gICAgICB5OiB0aGlzLnJlY3QudG9wICsgdGhpcy5yZWN0LmhlaWdodCAvIDJcbiAgICB9XG5cbiAgICAvLyBUaGUgdmVjdG9yIHRvIHRyYW5zbGF0ZSBpbWFnZSB0byB0aGUgd2luZG93IGNlbnRlclxuICAgIHJldHVybiB7XG4gICAgICB4OiB3aW5kb3dDZW50ZXIueCAtIHRhcmdldENlbnRlci54LFxuICAgICAgeTogd2luZG93Q2VudGVyLnkgLSB0YXJnZXRDZW50ZXIueVxuICAgIH1cbiAgfSxcblxuICBjYWxjdWxhdGVTY2FsZSgpIHtcbiAgICBjb25zdCB7IHpvb21pbmdIZWlnaHQsIHpvb21pbmdXaWR0aCB9ID0gdGhpcy5lbC5kYXRhc2V0XG4gICAgY29uc3QgeyBjdXN0b21TaXplLCBzY2FsZUJhc2UgfSA9IHRoaXMuaW5zdGFuY2Uub3B0aW9uc1xuXG4gICAgaWYgKCFjdXN0b21TaXplICYmIHpvb21pbmdIZWlnaHQgJiYgem9vbWluZ1dpZHRoKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICB4OiB6b29taW5nV2lkdGggLyB0aGlzLnJlY3Qud2lkdGgsXG4gICAgICAgIHk6IHpvb21pbmdIZWlnaHQgLyB0aGlzLnJlY3QuaGVpZ2h0XG4gICAgICB9XG4gICAgfSBlbHNlIGlmIChjdXN0b21TaXplICYmIHR5cGVvZiBjdXN0b21TaXplID09PSAnb2JqZWN0Jykge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgeDogY3VzdG9tU2l6ZS53aWR0aCAvIHRoaXMucmVjdC53aWR0aCxcbiAgICAgICAgeTogY3VzdG9tU2l6ZS5oZWlnaHQgLyB0aGlzLnJlY3QuaGVpZ2h0XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnN0IHRhcmdldEhhbGZXaWR0aCA9IHRoaXMucmVjdC53aWR0aCAvIDJcbiAgICAgIGNvbnN0IHRhcmdldEhhbGZIZWlnaHQgPSB0aGlzLnJlY3QuaGVpZ2h0IC8gMlxuICAgICAgY29uc3Qgd2luZG93Q2VudGVyID0gZ2V0V2luZG93Q2VudGVyKClcblxuICAgICAgLy8gVGhlIGRpc3RhbmNlIGJldHdlZW4gdGFyZ2V0IGVkZ2UgYW5kIHdpbmRvdyBlZGdlXG4gICAgICBjb25zdCB0YXJnZXRFZGdlVG9XaW5kb3dFZGdlID0ge1xuICAgICAgICB4OiB3aW5kb3dDZW50ZXIueCAtIHRhcmdldEhhbGZXaWR0aCxcbiAgICAgICAgeTogd2luZG93Q2VudGVyLnkgLSB0YXJnZXRIYWxmSGVpZ2h0XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHNjYWxlSG9yaXpvbnRhbGx5ID0gdGFyZ2V0RWRnZVRvV2luZG93RWRnZS54IC8gdGFyZ2V0SGFsZldpZHRoXG4gICAgICBjb25zdCBzY2FsZVZlcnRpY2FsbHkgPSB0YXJnZXRFZGdlVG9XaW5kb3dFZGdlLnkgLyB0YXJnZXRIYWxmSGVpZ2h0XG5cbiAgICAgIC8vIFRoZSBhZGRpdGlvbmFsIHNjYWxlIGlzIGJhc2VkIG9uIHRoZSBzbWFsbGVyIHZhbHVlIG9mXG4gICAgICAvLyBzY2FsaW5nIGhvcml6b250YWxseSBhbmQgc2NhbGluZyB2ZXJ0aWNhbGx5XG4gICAgICBjb25zdCBzY2FsZSA9IHNjYWxlQmFzZSArIE1hdGgubWluKHNjYWxlSG9yaXpvbnRhbGx5LCBzY2FsZVZlcnRpY2FsbHkpXG5cbiAgICAgIGlmIChjdXN0b21TaXplICYmIHR5cGVvZiBjdXN0b21TaXplID09PSAnc3RyaW5nJykge1xuICAgICAgICAvLyBVc2Ugem9vbWluZ1dpZHRoIGFuZCB6b29taW5nSGVpZ2h0IGlmIGF2YWlsYWJsZVxuICAgICAgICBjb25zdCBuYXR1cmFsV2lkdGggPSB6b29taW5nV2lkdGggfHwgdGhpcy5lbC5uYXR1cmFsV2lkdGhcbiAgICAgICAgY29uc3QgbmF0dXJhbEhlaWdodCA9IHpvb21pbmdIZWlnaHQgfHwgdGhpcy5lbC5uYXR1cmFsSGVpZ2h0XG4gICAgICAgIGNvbnN0IG1heFpvb21pbmdXaWR0aCA9XG4gICAgICAgICAgcGFyc2VGbG9hdChjdXN0b21TaXplKSAqIG5hdHVyYWxXaWR0aCAvICgxMDAgKiB0aGlzLnJlY3Qud2lkdGgpXG4gICAgICAgIGNvbnN0IG1heFpvb21pbmdIZWlnaHQgPVxuICAgICAgICAgIHBhcnNlRmxvYXQoY3VzdG9tU2l6ZSkgKiBuYXR1cmFsSGVpZ2h0IC8gKDEwMCAqIHRoaXMucmVjdC5oZWlnaHQpXG5cbiAgICAgICAgLy8gT25seSBzY2FsZSBpbWFnZSB1cCB0byB0aGUgc3BlY2lmaWVkIGN1c3RvbVNpemUgcGVyY2VudGFnZVxuICAgICAgICBpZiAoc2NhbGUgPiBtYXhab29taW5nV2lkdGggfHwgc2NhbGUgPiBtYXhab29taW5nSGVpZ2h0KSB7XG4gICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHg6IG1heFpvb21pbmdXaWR0aCxcbiAgICAgICAgICAgIHk6IG1heFpvb21pbmdIZWlnaHRcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHtcbiAgICAgICAgeDogc2NhbGUsXG4gICAgICAgIHk6IHNjYWxlXG4gICAgICB9XG4gICAgfVxuICB9XG59XG5cbmZ1bmN0aW9uIGdldFdpbmRvd0NlbnRlcigpIHtcbiAgY29uc3QgZG9jRWwgPSBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnRcbiAgY29uc3Qgd2luZG93V2lkdGggPSBNYXRoLm1pbihkb2NFbC5jbGllbnRXaWR0aCwgd2luZG93LmlubmVyV2lkdGgpXG4gIGNvbnN0IHdpbmRvd0hlaWdodCA9IE1hdGgubWluKGRvY0VsLmNsaWVudEhlaWdodCwgd2luZG93LmlubmVySGVpZ2h0KVxuXG4gIHJldHVybiB7XG4gICAgeDogd2luZG93V2lkdGggLyAyLFxuICAgIHk6IHdpbmRvd0hlaWdodCAvIDJcbiAgfVxufVxuIiwiaW1wb3J0IHsgY3Vyc29yLCBsaXN0ZW4sIGxvYWRJbWFnZSwgZ2V0T3JpZ2luYWxTb3VyY2UgfSBmcm9tICcuL3V0aWxzJ1xuaW1wb3J0IERFRkFVTFRfT1BUSU9OUyBmcm9tICcuL29wdGlvbnMnXG5cbmltcG9ydCBoYW5kbGVyIGZyb20gJy4vaGFuZGxlcidcbmltcG9ydCBvdmVybGF5IGZyb20gJy4vb3ZlcmxheSdcbmltcG9ydCB0YXJnZXQgZnJvbSAnLi90YXJnZXQnXG5cbi8qKlxuICogWm9vbWluZyBpbnN0YW5jZS5cbiAqL1xuZXhwb3J0IGRlZmF1bHQgY2xhc3MgWm9vbWluZyB7XG4gIC8qKlxuICAgKiBAcGFyYW0ge09iamVjdH0gW29wdGlvbnNdIFVwZGF0ZSBkZWZhdWx0IG9wdGlvbnMgaWYgcHJvdmlkZWQuXG4gICAqL1xuICBjb25zdHJ1Y3RvcihvcHRpb25zKSB7XG4gICAgdGhpcy50YXJnZXQgPSBPYmplY3QuY3JlYXRlKHRhcmdldClcbiAgICB0aGlzLm92ZXJsYXkgPSBPYmplY3QuY3JlYXRlKG92ZXJsYXkpXG4gICAgdGhpcy5oYW5kbGVyID0gT2JqZWN0LmNyZWF0ZShoYW5kbGVyKVxuICAgIHRoaXMuYm9keSA9IGRvY3VtZW50LmJvZHlcblxuICAgIHRoaXMuc2hvd24gPSBmYWxzZVxuICAgIHRoaXMubG9jayA9IGZhbHNlXG4gICAgdGhpcy5yZWxlYXNlZCA9IHRydWVcbiAgICB0aGlzLmxhc3RTY3JvbGxQb3NpdGlvbiA9IG51bGxcbiAgICB0aGlzLnByZXNzVGltZXIgPSBudWxsXG5cbiAgICB0aGlzLm9wdGlvbnMgPSBPYmplY3QuYXNzaWduKHt9LCBERUZBVUxUX09QVElPTlMsIG9wdGlvbnMpXG4gICAgdGhpcy5vdmVybGF5LmluaXQodGhpcylcbiAgICB0aGlzLmhhbmRsZXIuaW5pdCh0aGlzKVxuICB9XG5cbiAgLyoqXG4gICAqIE1ha2UgZWxlbWVudChzKSB6b29tYWJsZS5cbiAgICogQHBhcmFtICB7c3RyaW5nfEVsZW1lbnR9IGVsIEEgY3NzIHNlbGVjdG9yIG9yIGFuIEVsZW1lbnQuXG4gICAqIEByZXR1cm4ge3RoaXN9XG4gICAqL1xuICBsaXN0ZW4oZWwpIHtcbiAgICBpZiAodHlwZW9mIGVsID09PSAnc3RyaW5nJykge1xuICAgICAgY29uc3QgZWxzID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbChlbClcbiAgICAgIGxldCBpID0gZWxzLmxlbmd0aFxuXG4gICAgICB3aGlsZSAoaS0tKSB7XG4gICAgICAgIHRoaXMubGlzdGVuKGVsc1tpXSlcbiAgICAgIH1cbiAgICB9IGVsc2UgaWYgKGVsLnRhZ05hbWUgPT09ICdJTUcnKSB7XG4gICAgICBlbC5zdHlsZS5jdXJzb3IgPSBjdXJzb3Iuem9vbUluXG4gICAgICBsaXN0ZW4oZWwsICdjbGljaycsIHRoaXMuaGFuZGxlci5jbGljaylcblxuICAgICAgaWYgKHRoaXMub3B0aW9ucy5wcmVsb2FkSW1hZ2UpIHtcbiAgICAgICAgbG9hZEltYWdlKGdldE9yaWdpbmFsU291cmNlKGVsKSlcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gdGhpc1xuICB9XG5cbiAgLyoqXG4gICAqIFVwZGF0ZSBvcHRpb25zIG9yIHJldHVybiBjdXJyZW50IG9wdGlvbnMgaWYgbm8gYXJndW1lbnQgaXMgcHJvdmlkZWQuXG4gICAqIEBwYXJhbSAge09iamVjdH0gb3B0aW9ucyBBbiBPYmplY3QgdGhhdCBjb250YWlucyB0aGlzLm9wdGlvbnMuXG4gICAqIEByZXR1cm4ge3RoaXN8dGhpcy5vcHRpb25zfVxuICAgKi9cbiAgY29uZmlnKG9wdGlvbnMpIHtcbiAgICBpZiAob3B0aW9ucykge1xuICAgICAgT2JqZWN0LmFzc2lnbih0aGlzLm9wdGlvbnMsIG9wdGlvbnMpXG4gICAgICB0aGlzLm92ZXJsYXkudXBkYXRlU3R5bGUodGhpcy5vcHRpb25zKVxuICAgICAgcmV0dXJuIHRoaXNcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIHRoaXMub3B0aW9uc1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBPcGVuICh6b29tIGluKSB0aGUgRWxlbWVudC5cbiAgICogQHBhcmFtICB7RWxlbWVudH0gZWwgVGhlIEVsZW1lbnQgdG8gb3Blbi5cbiAgICogQHBhcmFtICB7RnVuY3Rpb259IFtjYj10aGlzLm9wdGlvbnMub25PcGVuXSBBIGNhbGxiYWNrIGZ1bmN0aW9uIHRoYXQgd2lsbFxuICAgKiBiZSBjYWxsZWQgd2hlbiBhIHRhcmdldCBpcyBvcGVuZWQgYW5kIHRyYW5zaXRpb24gaGFzIGVuZGVkLiBJdCB3aWxsIGdldFxuICAgKiB0aGUgdGFyZ2V0IGVsZW1lbnQgYXMgdGhlIGFyZ3VtZW50LlxuICAgKiBAcmV0dXJuIHt0aGlzfVxuICAgKi9cbiAgb3BlbihlbCwgY2IgPSB0aGlzLm9wdGlvbnMub25PcGVuKSB7XG4gICAgaWYgKHRoaXMuc2hvd24gfHwgdGhpcy5sb2NrKSByZXR1cm5cblxuICAgIGNvbnN0IHRhcmdldCA9IHR5cGVvZiBlbCA9PT0gJ3N0cmluZycgPyBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKGVsKSA6IGVsXG5cbiAgICBpZiAodGFyZ2V0LnRhZ05hbWUgIT09ICdJTUcnKSByZXR1cm5cblxuICAgIHRoaXMub3B0aW9ucy5vbkJlZm9yZU9wZW4odGFyZ2V0KVxuXG4gICAgdGhpcy50YXJnZXQuaW5pdCh0YXJnZXQsIHRoaXMpXG5cbiAgICBpZiAoIXRoaXMub3B0aW9ucy5wcmVsb2FkSW1hZ2UpIHtcbiAgICAgIGNvbnN0IHsgc3JjT3JpZ2luYWwgfSA9IHRoaXMudGFyZ2V0XG5cbiAgICAgIGlmIChzcmNPcmlnaW5hbCAhPSBudWxsKSB7XG4gICAgICAgIHRoaXMub3B0aW9ucy5vbkltYWdlTG9hZGluZyh0YXJnZXQpXG4gICAgICAgIGxvYWRJbWFnZShzcmNPcmlnaW5hbCwgdGhpcy5vcHRpb25zLm9uSW1hZ2VMb2FkZWQpXG4gICAgICB9XG4gICAgfVxuXG4gICAgdGhpcy5zaG93biA9IHRydWVcbiAgICB0aGlzLmxvY2sgPSB0cnVlXG5cbiAgICB0aGlzLnRhcmdldC56b29tSW4oKVxuICAgIHRoaXMub3ZlcmxheS5pbnNlcnQoKVxuICAgIHRoaXMub3ZlcmxheS5mYWRlSW4oKVxuXG4gICAgbGlzdGVuKGRvY3VtZW50LCAnc2Nyb2xsJywgdGhpcy5oYW5kbGVyLnNjcm9sbClcbiAgICBsaXN0ZW4oZG9jdW1lbnQsICdrZXlkb3duJywgdGhpcy5oYW5kbGVyLmtleWRvd24pXG5cbiAgICBpZiAodGhpcy5vcHRpb25zLmNsb3NlT25XaW5kb3dSZXNpemUpIHtcbiAgICAgIGxpc3Rlbih3aW5kb3csICdyZXNpemUnLCB0aGlzLmhhbmRsZXIucmVzaXplV2luZG93KVxuICAgIH1cblxuICAgIGNvbnN0IG9uT3BlbkVuZCA9ICgpID0+IHtcbiAgICAgIGxpc3Rlbih0YXJnZXQsICd0cmFuc2l0aW9uZW5kJywgb25PcGVuRW5kLCBmYWxzZSlcbiAgICAgIHRoaXMubG9jayA9IGZhbHNlXG4gICAgICB0aGlzLnRhcmdldC51cGdyYWRlU291cmNlKClcblxuICAgICAgaWYgKHRoaXMub3B0aW9ucy5lbmFibGVHcmFiKSB7XG4gICAgICAgIHRvZ2dsZUdyYWJMaXN0ZW5lcnMoZG9jdW1lbnQsIHRoaXMuaGFuZGxlciwgdHJ1ZSlcbiAgICAgIH1cblxuICAgICAgY2IodGFyZ2V0KVxuICAgIH1cblxuICAgIGxpc3Rlbih0YXJnZXQsICd0cmFuc2l0aW9uZW5kJywgb25PcGVuRW5kKVxuXG4gICAgcmV0dXJuIHRoaXNcbiAgfVxuXG4gIC8qKlxuICAgKiBDbG9zZSAoem9vbSBvdXQpIHRoZSBFbGVtZW50IGN1cnJlbnRseSBvcGVuZWQuXG4gICAqIEBwYXJhbSAge0Z1bmN0aW9ufSBbY2I9dGhpcy5vcHRpb25zLm9uQ2xvc2VdIEEgY2FsbGJhY2sgZnVuY3Rpb24gdGhhdCB3aWxsXG4gICAqIGJlIGNhbGxlZCB3aGVuIGEgdGFyZ2V0IGlzIGNsb3NlZCBhbmQgdHJhbnNpdGlvbiBoYXMgZW5kZWQuIEl0IHdpbGwgZ2V0XG4gICAqIHRoZSB0YXJnZXQgZWxlbWVudCBhcyB0aGUgYXJndW1lbnQuXG4gICAqIEByZXR1cm4ge3RoaXN9XG4gICAqL1xuICBjbG9zZShjYiA9IHRoaXMub3B0aW9ucy5vbkNsb3NlKSB7XG4gICAgaWYgKCF0aGlzLnNob3duIHx8IHRoaXMubG9jaykgcmV0dXJuXG5cbiAgICBjb25zdCB0YXJnZXQgPSB0aGlzLnRhcmdldC5lbFxuXG4gICAgdGhpcy5vcHRpb25zLm9uQmVmb3JlQ2xvc2UodGFyZ2V0KVxuXG4gICAgdGhpcy5sb2NrID0gdHJ1ZVxuICAgIHRoaXMuYm9keS5zdHlsZS5jdXJzb3IgPSBjdXJzb3IuZGVmYXVsdFxuICAgIHRoaXMub3ZlcmxheS5mYWRlT3V0KClcbiAgICB0aGlzLnRhcmdldC56b29tT3V0KClcblxuICAgIGxpc3Rlbihkb2N1bWVudCwgJ3Njcm9sbCcsIHRoaXMuaGFuZGxlci5zY3JvbGwsIGZhbHNlKVxuICAgIGxpc3Rlbihkb2N1bWVudCwgJ2tleWRvd24nLCB0aGlzLmhhbmRsZXIua2V5ZG93biwgZmFsc2UpXG5cbiAgICBpZiAodGhpcy5vcHRpb25zLmNsb3NlT25XaW5kb3dSZXNpemUpIHtcbiAgICAgIGxpc3Rlbih3aW5kb3csICdyZXNpemUnLCB0aGlzLmhhbmRsZXIucmVzaXplV2luZG93LCBmYWxzZSlcbiAgICB9XG5cbiAgICBjb25zdCBvbkNsb3NlRW5kID0gKCkgPT4ge1xuICAgICAgbGlzdGVuKHRhcmdldCwgJ3RyYW5zaXRpb25lbmQnLCBvbkNsb3NlRW5kLCBmYWxzZSlcblxuICAgICAgdGhpcy5zaG93biA9IGZhbHNlXG4gICAgICB0aGlzLmxvY2sgPSBmYWxzZVxuXG4gICAgICB0aGlzLnRhcmdldC5kb3duZ3JhZGVTb3VyY2UoKVxuXG4gICAgICBpZiAodGhpcy5vcHRpb25zLmVuYWJsZUdyYWIpIHtcbiAgICAgICAgdG9nZ2xlR3JhYkxpc3RlbmVycyhkb2N1bWVudCwgdGhpcy5oYW5kbGVyLCBmYWxzZSlcbiAgICAgIH1cblxuICAgICAgdGhpcy50YXJnZXQucmVzdG9yZUNsb3NlU3R5bGUoKVxuICAgICAgdGhpcy5vdmVybGF5LnJlbW92ZSgpXG5cbiAgICAgIGNiKHRhcmdldClcbiAgICB9XG5cbiAgICBsaXN0ZW4odGFyZ2V0LCAndHJhbnNpdGlvbmVuZCcsIG9uQ2xvc2VFbmQpXG5cbiAgICByZXR1cm4gdGhpc1xuICB9XG5cbiAgLyoqXG4gICAqIEdyYWIgdGhlIEVsZW1lbnQgY3VycmVudGx5IG9wZW5lZCBnaXZlbiBhIHBvc2l0aW9uIGFuZCBhcHBseSBleHRyYSB6b29tLWluLlxuICAgKiBAcGFyYW0gIHtudW1iZXJ9ICAgeCBUaGUgWC1heGlzIG9mIHdoZXJlIHRoZSBwcmVzcyBoYXBwZW5lZC5cbiAgICogQHBhcmFtICB7bnVtYmVyfSAgIHkgVGhlIFktYXhpcyBvZiB3aGVyZSB0aGUgcHJlc3MgaGFwcGVuZWQuXG4gICAqIEBwYXJhbSAge251bWJlcn0gICBzY2FsZUV4dHJhIEV4dHJhIHpvb20taW4gdG8gYXBwbHkuXG4gICAqIEBwYXJhbSAge0Z1bmN0aW9ufSBbY2I9dGhpcy5vcHRpb25zLm9uR3JhYl0gQSBjYWxsYmFjayBmdW5jdGlvbiB0aGF0XG4gICAqIHdpbGwgYmUgY2FsbGVkIHdoZW4gYSB0YXJnZXQgaXMgZ3JhYmJlZCBhbmQgdHJhbnNpdGlvbiBoYXMgZW5kZWQuIEl0XG4gICAqIHdpbGwgZ2V0IHRoZSB0YXJnZXQgZWxlbWVudCBhcyB0aGUgYXJndW1lbnQuXG4gICAqIEByZXR1cm4ge3RoaXN9XG4gICAqL1xuICBncmFiKHgsIHksIHNjYWxlRXh0cmEgPSB0aGlzLm9wdGlvbnMuc2NhbGVFeHRyYSwgY2IgPSB0aGlzLm9wdGlvbnMub25HcmFiKSB7XG4gICAgaWYgKCF0aGlzLnNob3duIHx8IHRoaXMubG9jaykgcmV0dXJuXG5cbiAgICBjb25zdCB0YXJnZXQgPSB0aGlzLnRhcmdldC5lbFxuXG4gICAgdGhpcy5vcHRpb25zLm9uQmVmb3JlR3JhYih0YXJnZXQpXG5cbiAgICB0aGlzLnJlbGVhc2VkID0gZmFsc2VcbiAgICB0aGlzLnRhcmdldC5ncmFiKHgsIHksIHNjYWxlRXh0cmEpXG5cbiAgICBjb25zdCBvbkdyYWJFbmQgPSAoKSA9PiB7XG4gICAgICBsaXN0ZW4odGFyZ2V0LCAndHJhbnNpdGlvbmVuZCcsIG9uR3JhYkVuZCwgZmFsc2UpXG4gICAgICBjYih0YXJnZXQpXG4gICAgfVxuXG4gICAgbGlzdGVuKHRhcmdldCwgJ3RyYW5zaXRpb25lbmQnLCBvbkdyYWJFbmQpXG5cbiAgICByZXR1cm4gdGhpc1xuICB9XG5cbiAgLyoqXG4gICAqIE1vdmUgdGhlIEVsZW1lbnQgY3VycmVudGx5IGdyYWJiZWQgZ2l2ZW4gYSBwb3NpdGlvbiBhbmQgYXBwbHkgZXh0cmEgem9vbS1pbi5cbiAgICogQHBhcmFtICB7bnVtYmVyfSAgIHggVGhlIFgtYXhpcyBvZiB3aGVyZSB0aGUgcHJlc3MgaGFwcGVuZWQuXG4gICAqIEBwYXJhbSAge251bWJlcn0gICB5IFRoZSBZLWF4aXMgb2Ygd2hlcmUgdGhlIHByZXNzIGhhcHBlbmVkLlxuICAgKiBAcGFyYW0gIHtudW1iZXJ9ICAgc2NhbGVFeHRyYSBFeHRyYSB6b29tLWluIHRvIGFwcGx5LlxuICAgKiBAcGFyYW0gIHtGdW5jdGlvbn0gW2NiPXRoaXMub3B0aW9ucy5vbk1vdmVdIEEgY2FsbGJhY2sgZnVuY3Rpb24gdGhhdFxuICAgKiB3aWxsIGJlIGNhbGxlZCB3aGVuIGEgdGFyZ2V0IGlzIG1vdmVkIGFuZCB0cmFuc2l0aW9uIGhhcyBlbmRlZC4gSXQgd2lsbFxuICAgKiBnZXQgdGhlIHRhcmdldCBlbGVtZW50IGFzIHRoZSBhcmd1bWVudC5cbiAgICogQHJldHVybiB7dGhpc31cbiAgICovXG4gIG1vdmUoeCwgeSwgc2NhbGVFeHRyYSA9IHRoaXMub3B0aW9ucy5zY2FsZUV4dHJhLCBjYiA9IHRoaXMub3B0aW9ucy5vbk1vdmUpIHtcbiAgICBpZiAoIXRoaXMuc2hvd24gfHwgdGhpcy5sb2NrKSByZXR1cm5cblxuICAgIHRoaXMucmVsZWFzZWQgPSBmYWxzZVxuICAgIHRoaXMuYm9keS5zdHlsZS5jdXJzb3IgPSBjdXJzb3IubW92ZVxuICAgIHRoaXMudGFyZ2V0Lm1vdmUoeCwgeSwgc2NhbGVFeHRyYSlcblxuICAgIGNvbnN0IHRhcmdldCA9IHRoaXMudGFyZ2V0LmVsXG5cbiAgICBjb25zdCBvbk1vdmVFbmQgPSAoKSA9PiB7XG4gICAgICBsaXN0ZW4odGFyZ2V0LCAndHJhbnNpdGlvbmVuZCcsIG9uTW92ZUVuZCwgZmFsc2UpXG4gICAgICBjYih0YXJnZXQpXG4gICAgfVxuXG4gICAgbGlzdGVuKHRhcmdldCwgJ3RyYW5zaXRpb25lbmQnLCBvbk1vdmVFbmQpXG5cbiAgICByZXR1cm4gdGhpc1xuICB9XG5cbiAgLyoqXG4gICAqIFJlbGVhc2UgdGhlIEVsZW1lbnQgY3VycmVudGx5IGdyYWJiZWQuXG4gICAqIEBwYXJhbSAge0Z1bmN0aW9ufSBbY2I9dGhpcy5vcHRpb25zLm9uUmVsZWFzZV0gQSBjYWxsYmFjayBmdW5jdGlvbiB0aGF0XG4gICAqIHdpbGwgYmUgY2FsbGVkIHdoZW4gYSB0YXJnZXQgaXMgcmVsZWFzZWQgYW5kIHRyYW5zaXRpb24gaGFzIGVuZGVkLiBJdFxuICAgKiB3aWxsIGdldCB0aGUgdGFyZ2V0IGVsZW1lbnQgYXMgdGhlIGFyZ3VtZW50LlxuICAgKiBAcmV0dXJuIHt0aGlzfVxuICAgKi9cbiAgcmVsZWFzZShjYiA9IHRoaXMub3B0aW9ucy5vblJlbGVhc2UpIHtcbiAgICBpZiAoIXRoaXMuc2hvd24gfHwgdGhpcy5sb2NrKSByZXR1cm5cblxuICAgIGNvbnN0IHRhcmdldCA9IHRoaXMudGFyZ2V0LmVsXG5cbiAgICB0aGlzLm9wdGlvbnMub25CZWZvcmVSZWxlYXNlKHRhcmdldClcblxuICAgIHRoaXMubG9jayA9IHRydWVcbiAgICB0aGlzLmJvZHkuc3R5bGUuY3Vyc29yID0gY3Vyc29yLmRlZmF1bHRcbiAgICB0aGlzLnRhcmdldC5yZXN0b3JlT3BlblN0eWxlKClcblxuICAgIGNvbnN0IG9uUmVsZWFzZUVuZCA9ICgpID0+IHtcbiAgICAgIGxpc3Rlbih0YXJnZXQsICd0cmFuc2l0aW9uZW5kJywgb25SZWxlYXNlRW5kLCBmYWxzZSlcbiAgICAgIHRoaXMubG9jayA9IGZhbHNlXG4gICAgICB0aGlzLnJlbGVhc2VkID0gdHJ1ZVxuICAgICAgY2IodGFyZ2V0KVxuICAgIH1cblxuICAgIGxpc3Rlbih0YXJnZXQsICd0cmFuc2l0aW9uZW5kJywgb25SZWxlYXNlRW5kKVxuXG4gICAgcmV0dXJuIHRoaXNcbiAgfVxufVxuXG5mdW5jdGlvbiB0b2dnbGVHcmFiTGlzdGVuZXJzKGVsLCBoYW5kbGVyLCBhZGQpIHtcbiAgY29uc3QgdHlwZXMgPSBbXG4gICAgJ21vdXNlZG93bicsXG4gICAgJ21vdXNlbW92ZScsXG4gICAgJ21vdXNldXAnLFxuICAgICd0b3VjaHN0YXJ0JyxcbiAgICAndG91Y2htb3ZlJyxcbiAgICAndG91Y2hlbmQnXG4gIF1cblxuICB0eXBlcy5mb3JFYWNoKGZ1bmN0aW9uIHRvZ2dsZUxpc3RlbmVyKHR5cGUpIHtcbiAgICBsaXN0ZW4oZWwsIHR5cGUsIGhhbmRsZXJbdHlwZV0sIGFkZClcbiAgfSlcbn1cbiJdLCJuYW1lcyI6WyJjdXJzb3IiLCJkZWZhdWx0Iiwiem9vbUluIiwiem9vbU91dCIsImdyYWIiLCJtb3ZlIiwibGlzdGVuIiwiZWwiLCJldmVudCIsImhhbmRsZXIiLCJhZGQiLCJvcHRpb25zIiwicGFzc2l2ZSIsImFkZEV2ZW50TGlzdGVuZXIiLCJyZW1vdmVFdmVudExpc3RlbmVyIiwibG9hZEltYWdlIiwic3JjIiwiY2IiLCJpbWciLCJJbWFnZSIsIm9ubG9hZCIsIm9uSW1hZ2VMb2FkIiwiZ2V0T3JpZ2luYWxTb3VyY2UiLCJkYXRhc2V0Iiwib3JpZ2luYWwiLCJwYXJlbnROb2RlIiwidGFnTmFtZSIsImdldEF0dHJpYnV0ZSIsInNldFN0eWxlIiwic3R5bGVzIiwicmVtZW1iZXIiLCJ0cmFuc2l0aW9uIiwidmFsdWUiLCJ0cmFuc2Zvcm0iLCJzIiwic3R5bGUiLCJrZXkiLCJiaW5kQWxsIiwiX3RoaXMiLCJ0aGF0IiwibWV0aG9kcyIsIk9iamVjdCIsImdldE93blByb3BlcnR5TmFtZXMiLCJnZXRQcm90b3R5cGVPZiIsImZvckVhY2giLCJiaW5kT25lIiwibWV0aG9kIiwiYmluZCIsIm5vb3AiLCJlbmFibGVHcmFiIiwicHJlbG9hZEltYWdlIiwiY2xvc2VPbldpbmRvd1Jlc2l6ZSIsInRyYW5zaXRpb25EdXJhdGlvbiIsInRyYW5zaXRpb25UaW1pbmdGdW5jdGlvbiIsImJnQ29sb3IiLCJiZ09wYWNpdHkiLCJzY2FsZUJhc2UiLCJzY2FsZUV4dHJhIiwic2Nyb2xsVGhyZXNob2xkIiwiekluZGV4IiwiY3VzdG9tU2l6ZSIsIm9uT3BlbiIsIm9uQ2xvc2UiLCJvbkdyYWIiLCJvbk1vdmUiLCJvblJlbGVhc2UiLCJvbkJlZm9yZU9wZW4iLCJvbkJlZm9yZUNsb3NlIiwib25CZWZvcmVHcmFiIiwib25CZWZvcmVSZWxlYXNlIiwib25JbWFnZUxvYWRpbmciLCJvbkltYWdlTG9hZGVkIiwiUFJFU1NfREVMQVkiLCJpbml0IiwiaW5zdGFuY2UiLCJjbGljayIsImUiLCJwcmV2ZW50RGVmYXVsdCIsImlzUHJlc3NpbmdNZXRhS2V5Iiwid2luZG93Iiwib3BlbiIsInRhcmdldCIsInNyY09yaWdpbmFsIiwiY3VycmVudFRhcmdldCIsInNob3duIiwicmVsZWFzZWQiLCJjbG9zZSIsInJlbGVhc2UiLCJzY3JvbGwiLCJkb2N1bWVudCIsImRvY3VtZW50RWxlbWVudCIsImJvZHkiLCJzY3JvbGxMZWZ0IiwicGFnZVhPZmZzZXQiLCJzY3JvbGxUb3AiLCJwYWdlWU9mZnNldCIsImxhc3RTY3JvbGxQb3NpdGlvbiIsIngiLCJ5IiwiZGVsdGFYIiwiZGVsdGFZIiwidGhyZXNob2xkIiwiTWF0aCIsImFicyIsImtleWRvd24iLCJpc0VzY2FwZSIsIm1vdXNlZG93biIsImlzTGVmdEJ1dHRvbiIsImNsaWVudFgiLCJjbGllbnRZIiwicHJlc3NUaW1lciIsInNldFRpbWVvdXQiLCJncmFiT25Nb3VzZURvd24iLCJtb3VzZW1vdmUiLCJtb3VzZXVwIiwiY2xlYXJUaW1lb3V0IiwidG91Y2hzdGFydCIsInRvdWNoZXMiLCJncmFiT25Ub3VjaFN0YXJ0IiwidG91Y2htb3ZlIiwidG91Y2hlbmQiLCJpc1RvdWNoaW5nIiwiY2xpY2tPdmVybGF5IiwicmVzaXplV2luZG93IiwiYnV0dG9uIiwibWV0YUtleSIsImN0cmxLZXkiLCJ0YXJnZXRUb3VjaGVzIiwibGVuZ3RoIiwiY29kZSIsImtleUNvZGUiLCJjcmVhdGVFbGVtZW50IiwicGFyZW50IiwicG9zaXRpb24iLCJ0b3AiLCJsZWZ0IiwicmlnaHQiLCJib3R0b20iLCJvcGFjaXR5IiwidXBkYXRlU3R5bGUiLCJiYWNrZ3JvdW5kQ29sb3IiLCJpbnNlcnQiLCJhcHBlbmRDaGlsZCIsInJlbW92ZSIsInJlbW92ZUNoaWxkIiwiZmFkZUluIiwib2Zmc2V0V2lkdGgiLCJmYWRlT3V0IiwiVFJBTlNMQVRFX1oiLCJzcmNUaHVtYm5haWwiLCJzcmNzZXQiLCJyZWN0IiwiZ2V0Qm91bmRpbmdDbGllbnRSZWN0IiwidHJhbnNsYXRlIiwic2NhbGUiLCJzdHlsZU9wZW4iLCJzdHlsZUNsb3NlIiwiY2FsY3VsYXRlVHJhbnNsYXRlIiwiY2FsY3VsYXRlU2NhbGUiLCJoZWlnaHQiLCJ3aWR0aCIsIndpbmRvd0NlbnRlciIsImdldFdpbmRvd0NlbnRlciIsImR4IiwiZHkiLCJyZXN0b3JlQ2xvc2VTdHlsZSIsInJlc3RvcmVPcGVuU3R5bGUiLCJ1cGdyYWRlU291cmNlIiwicmVtb3ZlQXR0cmlidXRlIiwidGVtcCIsImNsb25lTm9kZSIsInNldEF0dHJpYnV0ZSIsInZpc2liaWxpdHkiLCJ1cGRhdGVTcmMiLCJkb3duZ3JhZGVTb3VyY2UiLCJ0YXJnZXRDZW50ZXIiLCJ6b29taW5nSGVpZ2h0Iiwiem9vbWluZ1dpZHRoIiwidGFyZ2V0SGFsZldpZHRoIiwidGFyZ2V0SGFsZkhlaWdodCIsInRhcmdldEVkZ2VUb1dpbmRvd0VkZ2UiLCJzY2FsZUhvcml6b250YWxseSIsInNjYWxlVmVydGljYWxseSIsIm1pbiIsIm5hdHVyYWxXaWR0aCIsIm5hdHVyYWxIZWlnaHQiLCJtYXhab29taW5nV2lkdGgiLCJwYXJzZUZsb2F0IiwibWF4Wm9vbWluZ0hlaWdodCIsImRvY0VsIiwid2luZG93V2lkdGgiLCJjbGllbnRXaWR0aCIsImlubmVyV2lkdGgiLCJ3aW5kb3dIZWlnaHQiLCJjbGllbnRIZWlnaHQiLCJpbm5lckhlaWdodCIsIlpvb21pbmciLCJjb25zdHJ1Y3RvciIsImNyZWF0ZSIsIm92ZXJsYXkiLCJsb2NrIiwiYXNzaWduIiwiREVGQVVMVF9PUFRJT05TIiwiZWxzIiwicXVlcnlTZWxlY3RvckFsbCIsImkiLCJjb25maWciLCJxdWVyeVNlbGVjdG9yIiwib25PcGVuRW5kIiwidG9nZ2xlR3JhYkxpc3RlbmVycyIsIm9uQ2xvc2VFbmQiLCJvbkdyYWJFbmQiLCJvbk1vdmVFbmQiLCJvblJlbGVhc2VFbmQiLCJ0eXBlcyIsInRvZ2dsZUxpc3RlbmVyIiwidHlwZSJd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
