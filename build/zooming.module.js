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

export default Zooming;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiem9vbWluZy5tb2R1bGUuanMiLCJzb3VyY2VzIjpbIi4uL3NyYy91dGlscy5qcyIsIi4uL3NyYy9vcHRpb25zLmpzIiwiLi4vc3JjL2hhbmRsZXIuanMiLCIuLi9zcmMvb3ZlcmxheS5qcyIsIi4uL3NyYy90YXJnZXQuanMiLCIuLi9zcmMvaW5kZXguanMiXSwic291cmNlc0NvbnRlbnQiOlsiZXhwb3J0IGNvbnN0IGN1cnNvciA9IHtcbiAgZGVmYXVsdDogJ2F1dG8nLFxuICB6b29tSW46ICd6b29tLWluJyxcbiAgem9vbU91dDogJ3pvb20tb3V0JyxcbiAgZ3JhYjogJ2dyYWInLFxuICBtb3ZlOiAnbW92ZSdcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGxpc3RlbihlbCwgZXZlbnQsIGhhbmRsZXIsIGFkZCA9IHRydWUpIHtcbiAgY29uc3Qgb3B0aW9ucyA9IHsgcGFzc2l2ZTogZmFsc2UgfVxuXG4gIGlmIChhZGQpIHtcbiAgICBlbC5hZGRFdmVudExpc3RlbmVyKGV2ZW50LCBoYW5kbGVyLCBvcHRpb25zKVxuICB9IGVsc2Uge1xuICAgIGVsLnJlbW92ZUV2ZW50TGlzdGVuZXIoZXZlbnQsIGhhbmRsZXIsIG9wdGlvbnMpXG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGxvYWRJbWFnZShzcmMsIGNiKSB7XG4gIGlmIChzcmMpIHtcbiAgICBjb25zdCBpbWcgPSBuZXcgSW1hZ2UoKVxuXG4gICAgaW1nLm9ubG9hZCA9IGZ1bmN0aW9uIG9uSW1hZ2VMb2FkKCkge1xuICAgICAgaWYgKGNiKSBjYihpbWcpXG4gICAgfVxuXG4gICAgaW1nLnNyYyA9IHNyY1xuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRPcmlnaW5hbFNvdXJjZShlbCkge1xuICBpZiAoZWwuZGF0YXNldC5vcmlnaW5hbCkge1xuICAgIHJldHVybiBlbC5kYXRhc2V0Lm9yaWdpbmFsXG4gIH0gZWxzZSBpZiAoZWwucGFyZW50Tm9kZS50YWdOYW1lID09PSAnQScpIHtcbiAgICByZXR1cm4gZWwucGFyZW50Tm9kZS5nZXRBdHRyaWJ1dGUoJ2hyZWYnKVxuICB9IGVsc2Uge1xuICAgIHJldHVybiBudWxsXG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHNldFN0eWxlKGVsLCBzdHlsZXMsIHJlbWVtYmVyKSB7XG4gIGlmIChzdHlsZXMudHJhbnNpdGlvbikge1xuICAgIGNvbnN0IHZhbHVlID0gc3R5bGVzLnRyYW5zaXRpb25cbiAgICBkZWxldGUgc3R5bGVzLnRyYW5zaXRpb25cbiAgICBzdHlsZXMudHJhbnNpdGlvbiA9IHZhbHVlXG4gIH1cblxuICBpZiAoc3R5bGVzLnRyYW5zZm9ybSkge1xuICAgIGNvbnN0IHZhbHVlID0gc3R5bGVzLnRyYW5zZm9ybVxuICAgIGRlbGV0ZSBzdHlsZXMudHJhbnNmb3JtXG4gICAgc3R5bGVzLnRyYW5zZm9ybSA9IHZhbHVlXG4gIH1cblxuICBsZXQgcyA9IGVsLnN0eWxlXG4gIGxldCBvcmlnaW5hbCA9IHt9XG5cbiAgZm9yIChsZXQga2V5IGluIHN0eWxlcykge1xuICAgIGlmIChyZW1lbWJlcikge1xuICAgICAgb3JpZ2luYWxba2V5XSA9IHNba2V5XSB8fCAnJ1xuICAgIH1cblxuICAgIHNba2V5XSA9IHN0eWxlc1trZXldXG4gIH1cblxuICByZXR1cm4gb3JpZ2luYWxcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGJpbmRBbGwoX3RoaXMsIHRoYXQpIHtcbiAgY29uc3QgbWV0aG9kcyA9IE9iamVjdC5nZXRPd25Qcm9wZXJ0eU5hbWVzKE9iamVjdC5nZXRQcm90b3R5cGVPZihfdGhpcykpXG4gIG1ldGhvZHMuZm9yRWFjaChmdW5jdGlvbiBiaW5kT25lKG1ldGhvZCkge1xuICAgIF90aGlzW21ldGhvZF0gPSBfdGhpc1ttZXRob2RdLmJpbmQodGhhdClcbiAgfSlcbn1cbiIsImNvbnN0IG5vb3AgPSAoKSA9PiB7fVxuXG5leHBvcnQgZGVmYXVsdCB7XG4gIC8qKlxuICAgKiBUbyBiZSBhYmxlIHRvIGdyYWIgYW5kIGRyYWcgdGhlIGltYWdlIGZvciBleHRyYSB6b29tLWluLlxuICAgKiBAdHlwZSB7Ym9vbGVhbn1cbiAgICovXG4gIGVuYWJsZUdyYWI6IHRydWUsXG5cbiAgLyoqXG4gICAqIFByZWxvYWQgem9vbWFibGUgaW1hZ2VzLlxuICAgKiBAdHlwZSB7Ym9vbGVhbn1cbiAgICovXG4gIHByZWxvYWRJbWFnZTogZmFsc2UsXG5cbiAgLyoqXG4gICAqIENsb3NlIHRoZSB6b29tZWQgaW1hZ2Ugd2hlbiBicm93c2VyIHdpbmRvdyBpcyByZXNpemVkLlxuICAgKiBAdHlwZSB7Ym9vbGVhbn1cbiAgICovXG4gIGNsb3NlT25XaW5kb3dSZXNpemU6IHRydWUsXG5cbiAgLyoqXG4gICAqIFRyYW5zaXRpb24gZHVyYXRpb24gaW4gc2Vjb25kcy5cbiAgICogQHR5cGUge251bWJlcn1cbiAgICovXG4gIHRyYW5zaXRpb25EdXJhdGlvbjogMC40LFxuXG4gIC8qKlxuICAgKiBUcmFuc2l0aW9uIHRpbWluZyBmdW5jdGlvbi5cbiAgICogQHR5cGUge3N0cmluZ31cbiAgICovXG4gIHRyYW5zaXRpb25UaW1pbmdGdW5jdGlvbjogJ2N1YmljLWJlemllcigwLjQsIDAsIDAsIDEpJyxcblxuICAvKipcbiAgICogT3ZlcmxheSBiYWNrZ3JvdW5kIGNvbG9yLlxuICAgKiBAdHlwZSB7c3RyaW5nfVxuICAgKi9cbiAgYmdDb2xvcjogJ3JnYigyNTUsIDI1NSwgMjU1KScsXG5cbiAgLyoqXG4gICAqIE92ZXJsYXkgYmFja2dyb3VuZCBvcGFjaXR5LlxuICAgKiBAdHlwZSB7bnVtYmVyfVxuICAgKi9cbiAgYmdPcGFjaXR5OiAxLFxuXG4gIC8qKlxuICAgKiBUaGUgYmFzZSBzY2FsZSBmYWN0b3IgZm9yIHpvb21pbmcuIEJ5IGRlZmF1bHQgc2NhbGUgdG8gZml0IHRoZSB3aW5kb3cuXG4gICAqIEB0eXBlIHtudW1iZXJ9XG4gICAqL1xuICBzY2FsZUJhc2U6IDAuNSxcblxuICAvKipcbiAgICogVGhlIGFkZGl0aW9uYWwgc2NhbGUgZmFjdG9yIHdoZW4gZ3JhYmJpbmcgdGhlIGltYWdlLlxuICAgKiBAdHlwZSB7bnVtYmVyfVxuICAgKi9cbiAgc2NhbGVFeHRyYTogMi41LFxuXG4gIC8qKlxuICAgKiBIb3cgbXVjaCBzY3JvbGxpbmcgaXQgdGFrZXMgYmVmb3JlIGNsb3Npbmcgb3V0LlxuICAgKiBAdHlwZSB7bnVtYmVyfVxuICAgKi9cbiAgc2Nyb2xsVGhyZXNob2xkOiA0MCxcblxuICAvKipcbiAgICogVGhlIHotaW5kZXggdGhhdCB0aGUgb3ZlcmxheSB3aWxsIGJlIGFkZGVkIHdpdGguXG4gICAqIEB0eXBlIHtudW1iZXJ9XG4gICAqL1xuICB6SW5kZXg6IDk5OCxcblxuICAvKipcbiAgICogU2NhbGUgKHpvb20gaW4pIHRvIGdpdmVuIHdpZHRoIGFuZCBoZWlnaHQuIElnbm9yZSBzY2FsZUJhc2UgaWYgc2V0LlxuICAgKiBBbHRlcm5hdGl2ZWx5LCBwcm92aWRlIGEgcGVyY2VudGFnZSB2YWx1ZSByZWxhdGl2ZSB0byB0aGUgb3JpZ2luYWwgaW1hZ2Ugc2l6ZS5cbiAgICogQHR5cGUge09iamVjdHxTdHJpbmd9XG4gICAqIEBleGFtcGxlXG4gICAqIGN1c3RvbVNpemU6IHsgd2lkdGg6IDgwMCwgaGVpZ2h0OiA0MDAgfVxuICAgKiBjdXN0b21TaXplOiAxMDAlXG4gICAqL1xuICBjdXN0b21TaXplOiBub29wLFxuXG4gIC8qKlxuICAgKiBBIGNhbGxiYWNrIGZ1bmN0aW9uIHRoYXQgd2lsbCBiZSBjYWxsZWQgd2hlbiBhIHRhcmdldCBpcyBvcGVuZWQgYW5kXG4gICAqIHRyYW5zaXRpb24gaGFzIGVuZGVkLiBJdCB3aWxsIGdldCB0aGUgdGFyZ2V0IGVsZW1lbnQgYXMgdGhlIGFyZ3VtZW50LlxuICAgKiBAdHlwZSB7RnVuY3Rpb259XG4gICAqL1xuICBvbk9wZW46IG5vb3AsXG5cbiAgLyoqXG4gICAqIFNhbWUgYXMgYWJvdmUsIGV4Y2VwdCBmaXJlZCB3aGVuIGNsb3NlZC5cbiAgICogQHR5cGUge0Z1bmN0aW9ufVxuICAgKi9cbiAgb25DbG9zZTogbm9vcCxcblxuICAvKipcbiAgICogU2FtZSBhcyBhYm92ZSwgZXhjZXB0IGZpcmVkIHdoZW4gZ3JhYmJlZC5cbiAgICogQHR5cGUge0Z1bmN0aW9ufVxuICAgKi9cbiAgb25HcmFiOiBub29wLFxuXG4gIC8qKlxuICAgKiBTYW1lIGFzIGFib3ZlLCBleGNlcHQgZmlyZWQgd2hlbiBtb3ZlZC5cbiAgICogQHR5cGUge0Z1bmN0aW9ufVxuICAgKi9cbiAgb25Nb3ZlOiBub29wLFxuXG4gIC8qKlxuICAgKiBTYW1lIGFzIGFib3ZlLCBleGNlcHQgZmlyZWQgd2hlbiByZWxlYXNlZC5cbiAgICogQHR5cGUge0Z1bmN0aW9ufVxuICAgKi9cbiAgb25SZWxlYXNlOiBub29wLFxuXG4gIC8qKlxuICAgKiBBIGNhbGxiYWNrIGZ1bmN0aW9uIHRoYXQgd2lsbCBiZSBjYWxsZWQgYmVmb3JlIG9wZW4uXG4gICAqIEB0eXBlIHtGdW5jdGlvbn1cbiAgICovXG4gIG9uQmVmb3JlT3Blbjogbm9vcCxcblxuICAvKipcbiAgICogQSBjYWxsYmFjayBmdW5jdGlvbiB0aGF0IHdpbGwgYmUgY2FsbGVkIGJlZm9yZSBjbG9zZS5cbiAgICogQHR5cGUge0Z1bmN0aW9ufVxuICAgKi9cbiAgb25CZWZvcmVDbG9zZTogbm9vcCxcblxuICAvKipcbiAgICogQSBjYWxsYmFjayBmdW5jdGlvbiB0aGF0IHdpbGwgYmUgY2FsbGVkIGJlZm9yZSBncmFiLlxuICAgKiBAdHlwZSB7RnVuY3Rpb259XG4gICAqL1xuICBvbkJlZm9yZUdyYWI6IG5vb3AsXG5cbiAgLyoqXG4gICAqIEEgY2FsbGJhY2sgZnVuY3Rpb24gdGhhdCB3aWxsIGJlIGNhbGxlZCBiZWZvcmUgcmVsZWFzZS5cbiAgICogQHR5cGUge0Z1bmN0aW9ufVxuICAgKi9cbiAgb25CZWZvcmVSZWxlYXNlOiBub29wLFxuXG4gIC8qKlxuICAgKiBBIGNhbGxiYWNrIGZ1bmN0aW9uIHRoYXQgd2lsbCBiZSBjYWxsZWQgd2hlbiB0aGUgaGktcmVzIGltYWdlIGlzIGxvYWRpbmcuXG4gICAqIEB0eXBlIHtGdW5jdGlvbn1cbiAgICovXG4gIG9uSW1hZ2VMb2FkaW5nOiBub29wLFxuXG4gIC8qKlxuICAgKiBBIGNhbGxiYWNrIGZ1bmN0aW9uIHRoYXQgd2lsbCBiZSBjYWxsZWQgd2hlbiB0aGUgaGktcmVzIGltYWdlIGlzIGxvYWRlZC5cbiAgICogQHR5cGUge0Z1bmN0aW9ufVxuICAgKi9cbiAgb25JbWFnZUxvYWRlZDogbm9vcFxufVxuIiwiaW1wb3J0IHsgYmluZEFsbCB9IGZyb20gJy4vdXRpbHMnXG5cbmNvbnN0IFBSRVNTX0RFTEFZID0gMjAwXG5cbmV4cG9ydCBkZWZhdWx0IHtcbiAgaW5pdChpbnN0YW5jZSkge1xuICAgIGJpbmRBbGwodGhpcywgaW5zdGFuY2UpXG4gIH0sXG5cbiAgY2xpY2soZSkge1xuICAgIGUucHJldmVudERlZmF1bHQoKVxuXG4gICAgaWYgKGlzUHJlc3NpbmdNZXRhS2V5KGUpKSB7XG4gICAgICByZXR1cm4gd2luZG93Lm9wZW4oXG4gICAgICAgIHRoaXMudGFyZ2V0LnNyY09yaWdpbmFsIHx8IGUuY3VycmVudFRhcmdldC5zcmMsXG4gICAgICAgICdfYmxhbmsnXG4gICAgICApXG4gICAgfSBlbHNlIHtcbiAgICAgIGlmICh0aGlzLnNob3duKSB7XG4gICAgICAgIGlmICh0aGlzLnJlbGVhc2VkKSB7XG4gICAgICAgICAgdGhpcy5jbG9zZSgpXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhpcy5yZWxlYXNlKClcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGhpcy5vcGVuKGUuY3VycmVudFRhcmdldClcbiAgICAgIH1cbiAgICB9XG4gIH0sXG5cbiAgc2Nyb2xsKCkge1xuICAgIGNvbnN0IGVsID1cbiAgICAgIGRvY3VtZW50LmRvY3VtZW50RWxlbWVudCB8fCBkb2N1bWVudC5ib2R5LnBhcmVudE5vZGUgfHwgZG9jdW1lbnQuYm9keVxuICAgIGNvbnN0IHNjcm9sbExlZnQgPSB3aW5kb3cucGFnZVhPZmZzZXQgfHwgZWwuc2Nyb2xsTGVmdFxuICAgIGNvbnN0IHNjcm9sbFRvcCA9IHdpbmRvdy5wYWdlWU9mZnNldCB8fCBlbC5zY3JvbGxUb3BcblxuICAgIGlmICh0aGlzLmxhc3RTY3JvbGxQb3NpdGlvbiA9PT0gbnVsbCkge1xuICAgICAgdGhpcy5sYXN0U2Nyb2xsUG9zaXRpb24gPSB7XG4gICAgICAgIHg6IHNjcm9sbExlZnQsXG4gICAgICAgIHk6IHNjcm9sbFRvcFxuICAgICAgfVxuICAgIH1cblxuICAgIGNvbnN0IGRlbHRhWCA9IHRoaXMubGFzdFNjcm9sbFBvc2l0aW9uLnggLSBzY3JvbGxMZWZ0XG4gICAgY29uc3QgZGVsdGFZID0gdGhpcy5sYXN0U2Nyb2xsUG9zaXRpb24ueSAtIHNjcm9sbFRvcFxuICAgIGNvbnN0IHRocmVzaG9sZCA9IHRoaXMub3B0aW9ucy5zY3JvbGxUaHJlc2hvbGRcblxuICAgIGlmIChNYXRoLmFicyhkZWx0YVkpID49IHRocmVzaG9sZCB8fCBNYXRoLmFicyhkZWx0YVgpID49IHRocmVzaG9sZCkge1xuICAgICAgdGhpcy5sYXN0U2Nyb2xsUG9zaXRpb24gPSBudWxsXG4gICAgICB0aGlzLmNsb3NlKClcbiAgICB9XG4gIH0sXG5cbiAga2V5ZG93bihlKSB7XG4gICAgaWYgKGlzRXNjYXBlKGUpKSB7XG4gICAgICBpZiAodGhpcy5yZWxlYXNlZCkge1xuICAgICAgICB0aGlzLmNsb3NlKClcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRoaXMucmVsZWFzZSh0aGlzLmNsb3NlKVxuICAgICAgfVxuICAgIH1cbiAgfSxcblxuICBtb3VzZWRvd24oZSkge1xuICAgIGlmICghaXNMZWZ0QnV0dG9uKGUpIHx8IGlzUHJlc3NpbmdNZXRhS2V5KGUpKSByZXR1cm5cbiAgICBlLnByZXZlbnREZWZhdWx0KClcbiAgICBjb25zdCB7IGNsaWVudFgsIGNsaWVudFkgfSA9IGVcblxuICAgIHRoaXMucHJlc3NUaW1lciA9IHNldFRpbWVvdXQoXG4gICAgICBmdW5jdGlvbiBncmFiT25Nb3VzZURvd24oKSB7XG4gICAgICAgIHRoaXMuZ3JhYihjbGllbnRYLCBjbGllbnRZKVxuICAgICAgfS5iaW5kKHRoaXMpLFxuICAgICAgUFJFU1NfREVMQVlcbiAgICApXG4gIH0sXG5cbiAgbW91c2Vtb3ZlKGUpIHtcbiAgICBpZiAodGhpcy5yZWxlYXNlZCkgcmV0dXJuXG4gICAgdGhpcy5tb3ZlKGUuY2xpZW50WCwgZS5jbGllbnRZKVxuICB9LFxuXG4gIG1vdXNldXAoZSkge1xuICAgIGlmICghaXNMZWZ0QnV0dG9uKGUpIHx8IGlzUHJlc3NpbmdNZXRhS2V5KGUpKSByZXR1cm5cbiAgICBjbGVhclRpbWVvdXQodGhpcy5wcmVzc1RpbWVyKVxuXG4gICAgaWYgKHRoaXMucmVsZWFzZWQpIHtcbiAgICAgIHRoaXMuY2xvc2UoKVxuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLnJlbGVhc2UoKVxuICAgIH1cbiAgfSxcblxuICB0b3VjaHN0YXJ0KGUpIHtcbiAgICBlLnByZXZlbnREZWZhdWx0KClcbiAgICBjb25zdCB7IGNsaWVudFgsIGNsaWVudFkgfSA9IGUudG91Y2hlc1swXVxuXG4gICAgdGhpcy5wcmVzc1RpbWVyID0gc2V0VGltZW91dChcbiAgICAgIGZ1bmN0aW9uIGdyYWJPblRvdWNoU3RhcnQoKSB7XG4gICAgICAgIHRoaXMuZ3JhYihjbGllbnRYLCBjbGllbnRZKVxuICAgICAgfS5iaW5kKHRoaXMpLFxuICAgICAgUFJFU1NfREVMQVlcbiAgICApXG4gIH0sXG5cbiAgdG91Y2htb3ZlKGUpIHtcbiAgICBpZiAodGhpcy5yZWxlYXNlZCkgcmV0dXJuXG5cbiAgICBjb25zdCB7IGNsaWVudFgsIGNsaWVudFkgfSA9IGUudG91Y2hlc1swXVxuICAgIHRoaXMubW92ZShjbGllbnRYLCBjbGllbnRZKVxuICB9LFxuXG4gIHRvdWNoZW5kKGUpIHtcbiAgICBpZiAoaXNUb3VjaGluZyhlKSkgcmV0dXJuXG4gICAgY2xlYXJUaW1lb3V0KHRoaXMucHJlc3NUaW1lcilcblxuICAgIGlmICh0aGlzLnJlbGVhc2VkKSB7XG4gICAgICB0aGlzLmNsb3NlKClcbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy5yZWxlYXNlKClcbiAgICB9XG4gIH0sXG5cbiAgY2xpY2tPdmVybGF5KCkge1xuICAgIHRoaXMuY2xvc2UoKVxuICB9LFxuXG4gIHJlc2l6ZVdpbmRvdygpIHtcbiAgICB0aGlzLmNsb3NlKClcbiAgfVxufVxuXG5mdW5jdGlvbiBpc0xlZnRCdXR0b24oZSkge1xuICByZXR1cm4gZS5idXR0b24gPT09IDBcbn1cblxuZnVuY3Rpb24gaXNQcmVzc2luZ01ldGFLZXkoZSkge1xuICByZXR1cm4gZS5tZXRhS2V5IHx8IGUuY3RybEtleVxufVxuXG5mdW5jdGlvbiBpc1RvdWNoaW5nKGUpIHtcbiAgZS50YXJnZXRUb3VjaGVzLmxlbmd0aCA+IDBcbn1cblxuZnVuY3Rpb24gaXNFc2NhcGUoZSkge1xuICBjb25zdCBjb2RlID0gZS5rZXkgfHwgZS5jb2RlXG4gIHJldHVybiBjb2RlID09PSAnRXNjYXBlJyB8fCBlLmtleUNvZGUgPT09IDI3XG59XG4iLCJpbXBvcnQgeyBsaXN0ZW4sIHNldFN0eWxlIH0gZnJvbSAnLi91dGlscydcblxuZXhwb3J0IGRlZmF1bHQge1xuICBpbml0KGluc3RhbmNlKSB7XG4gICAgdGhpcy5lbCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpXG4gICAgdGhpcy5pbnN0YW5jZSA9IGluc3RhbmNlXG4gICAgdGhpcy5wYXJlbnQgPSBkb2N1bWVudC5ib2R5XG5cbiAgICBzZXRTdHlsZSh0aGlzLmVsLCB7XG4gICAgICBwb3NpdGlvbjogJ2ZpeGVkJyxcbiAgICAgIHRvcDogMCxcbiAgICAgIGxlZnQ6IDAsXG4gICAgICByaWdodDogMCxcbiAgICAgIGJvdHRvbTogMCxcbiAgICAgIG9wYWNpdHk6IDBcbiAgICB9KVxuXG4gICAgdGhpcy51cGRhdGVTdHlsZShpbnN0YW5jZS5vcHRpb25zKVxuICAgIGxpc3Rlbih0aGlzLmVsLCAnY2xpY2snLCBpbnN0YW5jZS5oYW5kbGVyLmNsaWNrT3ZlcmxheS5iaW5kKGluc3RhbmNlKSlcbiAgfSxcblxuICB1cGRhdGVTdHlsZShvcHRpb25zKSB7XG4gICAgc2V0U3R5bGUodGhpcy5lbCwge1xuICAgICAgekluZGV4OiBvcHRpb25zLnpJbmRleCxcbiAgICAgIGJhY2tncm91bmRDb2xvcjogb3B0aW9ucy5iZ0NvbG9yLFxuICAgICAgdHJhbnNpdGlvbjogYG9wYWNpdHlcbiAgICAgICAgJHtvcHRpb25zLnRyYW5zaXRpb25EdXJhdGlvbn1zXG4gICAgICAgICR7b3B0aW9ucy50cmFuc2l0aW9uVGltaW5nRnVuY3Rpb259YFxuICAgIH0pXG4gIH0sXG5cbiAgaW5zZXJ0KCkge1xuICAgIHRoaXMucGFyZW50LmFwcGVuZENoaWxkKHRoaXMuZWwpXG4gIH0sXG5cbiAgcmVtb3ZlKCkge1xuICAgIHRoaXMucGFyZW50LnJlbW92ZUNoaWxkKHRoaXMuZWwpXG4gIH0sXG5cbiAgZmFkZUluKCkge1xuICAgIHRoaXMuZWwub2Zmc2V0V2lkdGhcbiAgICB0aGlzLmVsLnN0eWxlLm9wYWNpdHkgPSB0aGlzLmluc3RhbmNlLm9wdGlvbnMuYmdPcGFjaXR5XG4gIH0sXG5cbiAgZmFkZU91dCgpIHtcbiAgICB0aGlzLmVsLnN0eWxlLm9wYWNpdHkgPSAwXG4gIH1cbn1cbiIsImltcG9ydCB7IGN1cnNvciwgc2V0U3R5bGUsIGdldE9yaWdpbmFsU291cmNlIH0gZnJvbSAnLi91dGlscydcblxuLy8gVHJhbnNsYXRlIHotYXhpcyB0byBmaXggQ1NTIGdyaWQgZGlzcGxheSBpc3N1ZSBpbiBDaHJvbWU6XG4vLyBodHRwczovL2dpdGh1Yi5jb20va2luZ2RpZG85OTkvem9vbWluZy9pc3N1ZXMvNDJcbmNvbnN0IFRSQU5TTEFURV9aID0gMFxuXG5leHBvcnQgZGVmYXVsdCB7XG4gIGluaXQoZWwsIGluc3RhbmNlKSB7XG4gICAgdGhpcy5lbCA9IGVsXG4gICAgdGhpcy5pbnN0YW5jZSA9IGluc3RhbmNlXG4gICAgdGhpcy5zcmNUaHVtYm5haWwgPSB0aGlzLmVsLmdldEF0dHJpYnV0ZSgnc3JjJylcbiAgICB0aGlzLnNyY3NldCA9IHRoaXMuZWwuZ2V0QXR0cmlidXRlKCdzcmNzZXQnKVxuICAgIHRoaXMuc3JjT3JpZ2luYWwgPSBnZXRPcmlnaW5hbFNvdXJjZSh0aGlzLmVsKVxuICAgIHRoaXMucmVjdCA9IHRoaXMuZWwuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KClcbiAgICB0aGlzLnRyYW5zbGF0ZSA9IG51bGxcbiAgICB0aGlzLnNjYWxlID0gbnVsbFxuICAgIHRoaXMuc3R5bGVPcGVuID0gbnVsbFxuICAgIHRoaXMuc3R5bGVDbG9zZSA9IG51bGxcbiAgfSxcblxuICB6b29tSW4oKSB7XG4gICAgY29uc3Qge1xuICAgICAgekluZGV4LFxuICAgICAgZW5hYmxlR3JhYixcbiAgICAgIHRyYW5zaXRpb25EdXJhdGlvbixcbiAgICAgIHRyYW5zaXRpb25UaW1pbmdGdW5jdGlvblxuICAgIH0gPSB0aGlzLmluc3RhbmNlLm9wdGlvbnNcbiAgICB0aGlzLnRyYW5zbGF0ZSA9IHRoaXMuY2FsY3VsYXRlVHJhbnNsYXRlKClcbiAgICB0aGlzLnNjYWxlID0gdGhpcy5jYWxjdWxhdGVTY2FsZSgpXG5cbiAgICB0aGlzLnN0eWxlT3BlbiA9IHtcbiAgICAgIHBvc2l0aW9uOiAncmVsYXRpdmUnLFxuICAgICAgekluZGV4OiB6SW5kZXggKyAxLFxuICAgICAgY3Vyc29yOiBlbmFibGVHcmFiID8gY3Vyc29yLmdyYWIgOiBjdXJzb3Iuem9vbU91dCxcbiAgICAgIHRyYW5zaXRpb246IGB0cmFuc2Zvcm1cbiAgICAgICAgJHt0cmFuc2l0aW9uRHVyYXRpb259c1xuICAgICAgICAke3RyYW5zaXRpb25UaW1pbmdGdW5jdGlvbn1gLFxuICAgICAgdHJhbnNmb3JtOiBgdHJhbnNsYXRlM2QoJHt0aGlzLnRyYW5zbGF0ZS54fXB4LCAke1xuICAgICAgICB0aGlzLnRyYW5zbGF0ZS55XG4gICAgICB9cHgsICR7VFJBTlNMQVRFX1p9cHgpXG4gICAgICAgIHNjYWxlKCR7dGhpcy5zY2FsZS54fSwke3RoaXMuc2NhbGUueX0pYCxcbiAgICAgIGhlaWdodDogYCR7dGhpcy5yZWN0LmhlaWdodH1weGAsXG4gICAgICB3aWR0aDogYCR7dGhpcy5yZWN0LndpZHRofXB4YFxuICAgIH1cblxuICAgIC8vIEZvcmNlIGxheW91dCB1cGRhdGVcbiAgICB0aGlzLmVsLm9mZnNldFdpZHRoXG5cbiAgICAvLyBUcmlnZ2VyIHRyYW5zaXRpb25cbiAgICB0aGlzLnN0eWxlQ2xvc2UgPSBzZXRTdHlsZSh0aGlzLmVsLCB0aGlzLnN0eWxlT3BlbiwgdHJ1ZSlcbiAgfSxcblxuICB6b29tT3V0KCkge1xuICAgIC8vIEZvcmNlIGxheW91dCB1cGRhdGVcbiAgICB0aGlzLmVsLm9mZnNldFdpZHRoXG5cbiAgICBzZXRTdHlsZSh0aGlzLmVsLCB7IHRyYW5zZm9ybTogJ25vbmUnIH0pXG4gIH0sXG5cbiAgZ3JhYih4LCB5LCBzY2FsZUV4dHJhKSB7XG4gICAgY29uc3Qgd2luZG93Q2VudGVyID0gZ2V0V2luZG93Q2VudGVyKClcbiAgICBjb25zdCBbZHgsIGR5XSA9IFt3aW5kb3dDZW50ZXIueCAtIHgsIHdpbmRvd0NlbnRlci55IC0geV1cblxuICAgIHNldFN0eWxlKHRoaXMuZWwsIHtcbiAgICAgIGN1cnNvcjogY3Vyc29yLm1vdmUsXG4gICAgICB0cmFuc2Zvcm06IGB0cmFuc2xhdGUzZChcbiAgICAgICAgJHt0aGlzLnRyYW5zbGF0ZS54ICsgZHh9cHgsICR7dGhpcy50cmFuc2xhdGUueSArXG4gICAgICAgIGR5fXB4LCAke1RSQU5TTEFURV9afXB4KVxuICAgICAgICBzY2FsZSgke3RoaXMuc2NhbGUueCArIHNjYWxlRXh0cmF9LCR7dGhpcy5zY2FsZS55ICsgc2NhbGVFeHRyYX0pYFxuICAgIH0pXG4gIH0sXG5cbiAgbW92ZSh4LCB5LCBzY2FsZUV4dHJhKSB7XG4gICAgY29uc3Qgd2luZG93Q2VudGVyID0gZ2V0V2luZG93Q2VudGVyKClcbiAgICBjb25zdCBbZHgsIGR5XSA9IFt3aW5kb3dDZW50ZXIueCAtIHgsIHdpbmRvd0NlbnRlci55IC0geV1cblxuICAgIHNldFN0eWxlKHRoaXMuZWwsIHtcbiAgICAgIHRyYW5zaXRpb246ICd0cmFuc2Zvcm0nLFxuICAgICAgdHJhbnNmb3JtOiBgdHJhbnNsYXRlM2QoXG4gICAgICAgICR7dGhpcy50cmFuc2xhdGUueCArIGR4fXB4LCAke3RoaXMudHJhbnNsYXRlLnkgK1xuICAgICAgICBkeX1weCwgJHtUUkFOU0xBVEVfWn1weClcbiAgICAgICAgc2NhbGUoJHt0aGlzLnNjYWxlLnggKyBzY2FsZUV4dHJhfSwke3RoaXMuc2NhbGUueSArIHNjYWxlRXh0cmF9KWBcbiAgICB9KVxuICB9LFxuXG4gIHJlc3RvcmVDbG9zZVN0eWxlKCkge1xuICAgIHNldFN0eWxlKHRoaXMuZWwsIHRoaXMuc3R5bGVDbG9zZSlcbiAgfSxcblxuICByZXN0b3JlT3BlblN0eWxlKCkge1xuICAgIHNldFN0eWxlKHRoaXMuZWwsIHRoaXMuc3R5bGVPcGVuKVxuICB9LFxuXG4gIHVwZ3JhZGVTb3VyY2UoKSB7XG4gICAgaWYgKHRoaXMuc3JjT3JpZ2luYWwpIHtcbiAgICAgIGNvbnN0IHBhcmVudE5vZGUgPSB0aGlzLmVsLnBhcmVudE5vZGVcblxuICAgICAgaWYgKHRoaXMuc3Jjc2V0KSB7XG4gICAgICAgIHRoaXMuZWwucmVtb3ZlQXR0cmlidXRlKCdzcmNzZXQnKVxuICAgICAgfVxuXG4gICAgICBjb25zdCB0ZW1wID0gdGhpcy5lbC5jbG9uZU5vZGUoZmFsc2UpXG5cbiAgICAgIC8vIEZvcmNlIGNvbXB1dGUgdGhlIGhpLXJlcyBpbWFnZSBpbiBET00gdG8gcHJldmVudFxuICAgICAgLy8gaW1hZ2UgZmxpY2tlcmluZyB3aGlsZSB1cGRhdGluZyBzcmNcbiAgICAgIHRlbXAuc2V0QXR0cmlidXRlKCdzcmMnLCB0aGlzLnNyY09yaWdpbmFsKVxuICAgICAgdGVtcC5zdHlsZS5wb3NpdGlvbiA9ICdmaXhlZCdcbiAgICAgIHRlbXAuc3R5bGUudmlzaWJpbGl0eSA9ICdoaWRkZW4nXG4gICAgICBwYXJlbnROb2RlLmFwcGVuZENoaWxkKHRlbXApXG5cbiAgICAgIC8vIEFkZCBkZWxheSB0byBwcmV2ZW50IEZpcmVmb3ggZnJvbSBmbGlja2VyaW5nXG4gICAgICBzZXRUaW1lb3V0KFxuICAgICAgICBmdW5jdGlvbiB1cGRhdGVTcmMoKSB7XG4gICAgICAgICAgdGhpcy5lbC5zZXRBdHRyaWJ1dGUoJ3NyYycsIHRoaXMuc3JjT3JpZ2luYWwpXG4gICAgICAgICAgcGFyZW50Tm9kZS5yZW1vdmVDaGlsZCh0ZW1wKVxuICAgICAgICB9LmJpbmQodGhpcyksXG4gICAgICAgIDUwXG4gICAgICApXG4gICAgfVxuICB9LFxuXG4gIGRvd25ncmFkZVNvdXJjZSgpIHtcbiAgICBpZiAodGhpcy5zcmNPcmlnaW5hbCkge1xuICAgICAgaWYgKHRoaXMuc3Jjc2V0KSB7XG4gICAgICAgIHRoaXMuZWwuc2V0QXR0cmlidXRlKCdzcmNzZXQnLCB0aGlzLnNyY3NldClcbiAgICAgIH1cbiAgICAgIHRoaXMuZWwuc2V0QXR0cmlidXRlKCdzcmMnLCB0aGlzLnNyY1RodW1ibmFpbClcbiAgICB9XG4gIH0sXG5cbiAgY2FsY3VsYXRlVHJhbnNsYXRlKCkge1xuICAgIGNvbnN0IHdpbmRvd0NlbnRlciA9IGdldFdpbmRvd0NlbnRlcigpXG4gICAgY29uc3QgdGFyZ2V0Q2VudGVyID0ge1xuICAgICAgeDogdGhpcy5yZWN0LmxlZnQgKyB0aGlzLnJlY3Qud2lkdGggLyAyLFxuICAgICAgeTogdGhpcy5yZWN0LnRvcCArIHRoaXMucmVjdC5oZWlnaHQgLyAyXG4gICAgfVxuXG4gICAgLy8gVGhlIHZlY3RvciB0byB0cmFuc2xhdGUgaW1hZ2UgdG8gdGhlIHdpbmRvdyBjZW50ZXJcbiAgICByZXR1cm4ge1xuICAgICAgeDogd2luZG93Q2VudGVyLnggLSB0YXJnZXRDZW50ZXIueCxcbiAgICAgIHk6IHdpbmRvd0NlbnRlci55IC0gdGFyZ2V0Q2VudGVyLnlcbiAgICB9XG4gIH0sXG5cbiAgY2FsY3VsYXRlU2NhbGUoKSB7XG4gICAgY29uc3QgeyB6b29taW5nSGVpZ2h0LCB6b29taW5nV2lkdGggfSA9IHRoaXMuZWwuZGF0YXNldFxuICAgIGNvbnN0IHsgY3VzdG9tU2l6ZSwgc2NhbGVCYXNlIH0gPSB0aGlzLmluc3RhbmNlLm9wdGlvbnNcblxuICAgIGlmICghY3VzdG9tU2l6ZSAmJiB6b29taW5nSGVpZ2h0ICYmIHpvb21pbmdXaWR0aCkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgeDogem9vbWluZ1dpZHRoIC8gdGhpcy5yZWN0LndpZHRoLFxuICAgICAgICB5OiB6b29taW5nSGVpZ2h0IC8gdGhpcy5yZWN0LmhlaWdodFxuICAgICAgfVxuICAgIH0gZWxzZSBpZiAoY3VzdG9tU2l6ZSAmJiB0eXBlb2YgY3VzdG9tU2l6ZSA9PT0gJ29iamVjdCcpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHg6IGN1c3RvbVNpemUud2lkdGggLyB0aGlzLnJlY3Qud2lkdGgsXG4gICAgICAgIHk6IGN1c3RvbVNpemUuaGVpZ2h0IC8gdGhpcy5yZWN0LmhlaWdodFxuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBjb25zdCB0YXJnZXRIYWxmV2lkdGggPSB0aGlzLnJlY3Qud2lkdGggLyAyXG4gICAgICBjb25zdCB0YXJnZXRIYWxmSGVpZ2h0ID0gdGhpcy5yZWN0LmhlaWdodCAvIDJcbiAgICAgIGNvbnN0IHdpbmRvd0NlbnRlciA9IGdldFdpbmRvd0NlbnRlcigpXG5cbiAgICAgIC8vIFRoZSBkaXN0YW5jZSBiZXR3ZWVuIHRhcmdldCBlZGdlIGFuZCB3aW5kb3cgZWRnZVxuICAgICAgY29uc3QgdGFyZ2V0RWRnZVRvV2luZG93RWRnZSA9IHtcbiAgICAgICAgeDogd2luZG93Q2VudGVyLnggLSB0YXJnZXRIYWxmV2lkdGgsXG4gICAgICAgIHk6IHdpbmRvd0NlbnRlci55IC0gdGFyZ2V0SGFsZkhlaWdodFxuICAgICAgfVxuXG4gICAgICBjb25zdCBzY2FsZUhvcml6b250YWxseSA9IHRhcmdldEVkZ2VUb1dpbmRvd0VkZ2UueCAvIHRhcmdldEhhbGZXaWR0aFxuICAgICAgY29uc3Qgc2NhbGVWZXJ0aWNhbGx5ID0gdGFyZ2V0RWRnZVRvV2luZG93RWRnZS55IC8gdGFyZ2V0SGFsZkhlaWdodFxuXG4gICAgICAvLyBUaGUgYWRkaXRpb25hbCBzY2FsZSBpcyBiYXNlZCBvbiB0aGUgc21hbGxlciB2YWx1ZSBvZlxuICAgICAgLy8gc2NhbGluZyBob3Jpem9udGFsbHkgYW5kIHNjYWxpbmcgdmVydGljYWxseVxuICAgICAgY29uc3Qgc2NhbGUgPSBzY2FsZUJhc2UgKyBNYXRoLm1pbihzY2FsZUhvcml6b250YWxseSwgc2NhbGVWZXJ0aWNhbGx5KVxuXG4gICAgICBpZiAoY3VzdG9tU2l6ZSAmJiB0eXBlb2YgY3VzdG9tU2l6ZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgLy8gVXNlIHpvb21pbmdXaWR0aCBhbmQgem9vbWluZ0hlaWdodCBpZiBhdmFpbGFibGVcbiAgICAgICAgY29uc3QgbmF0dXJhbFdpZHRoID0gem9vbWluZ1dpZHRoIHx8IHRoaXMuZWwubmF0dXJhbFdpZHRoXG4gICAgICAgIGNvbnN0IG5hdHVyYWxIZWlnaHQgPSB6b29taW5nSGVpZ2h0IHx8IHRoaXMuZWwubmF0dXJhbEhlaWdodFxuICAgICAgICBjb25zdCBtYXhab29taW5nV2lkdGggPVxuICAgICAgICAgIHBhcnNlRmxvYXQoY3VzdG9tU2l6ZSkgKiBuYXR1cmFsV2lkdGggLyAoMTAwICogdGhpcy5yZWN0LndpZHRoKVxuICAgICAgICBjb25zdCBtYXhab29taW5nSGVpZ2h0ID1cbiAgICAgICAgICBwYXJzZUZsb2F0KGN1c3RvbVNpemUpICogbmF0dXJhbEhlaWdodCAvICgxMDAgKiB0aGlzLnJlY3QuaGVpZ2h0KVxuXG4gICAgICAgIC8vIE9ubHkgc2NhbGUgaW1hZ2UgdXAgdG8gdGhlIHNwZWNpZmllZCBjdXN0b21TaXplIHBlcmNlbnRhZ2VcbiAgICAgICAgaWYgKHNjYWxlID4gbWF4Wm9vbWluZ1dpZHRoIHx8IHNjYWxlID4gbWF4Wm9vbWluZ0hlaWdodCkge1xuICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICB4OiBtYXhab29taW5nV2lkdGgsXG4gICAgICAgICAgICB5OiBtYXhab29taW5nSGVpZ2h0XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIHJldHVybiB7XG4gICAgICAgIHg6IHNjYWxlLFxuICAgICAgICB5OiBzY2FsZVxuICAgICAgfVxuICAgIH1cbiAgfVxufVxuXG5mdW5jdGlvbiBnZXRXaW5kb3dDZW50ZXIoKSB7XG4gIGNvbnN0IGRvY0VsID0gZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50XG4gIGNvbnN0IHdpbmRvd1dpZHRoID0gTWF0aC5taW4oZG9jRWwuY2xpZW50V2lkdGgsIHdpbmRvdy5pbm5lcldpZHRoKVxuICBjb25zdCB3aW5kb3dIZWlnaHQgPSBNYXRoLm1pbihkb2NFbC5jbGllbnRIZWlnaHQsIHdpbmRvdy5pbm5lckhlaWdodClcblxuICByZXR1cm4ge1xuICAgIHg6IHdpbmRvd1dpZHRoIC8gMixcbiAgICB5OiB3aW5kb3dIZWlnaHQgLyAyXG4gIH1cbn1cbiIsImltcG9ydCB7IGN1cnNvciwgbGlzdGVuLCBsb2FkSW1hZ2UsIGdldE9yaWdpbmFsU291cmNlIH0gZnJvbSAnLi91dGlscydcbmltcG9ydCBERUZBVUxUX09QVElPTlMgZnJvbSAnLi9vcHRpb25zJ1xuXG5pbXBvcnQgaGFuZGxlciBmcm9tICcuL2hhbmRsZXInXG5pbXBvcnQgb3ZlcmxheSBmcm9tICcuL292ZXJsYXknXG5pbXBvcnQgdGFyZ2V0IGZyb20gJy4vdGFyZ2V0J1xuXG4vKipcbiAqIFpvb21pbmcgaW5zdGFuY2UuXG4gKi9cbmV4cG9ydCBkZWZhdWx0IGNsYXNzIFpvb21pbmcge1xuICAvKipcbiAgICogQHBhcmFtIHtPYmplY3R9IFtvcHRpb25zXSBVcGRhdGUgZGVmYXVsdCBvcHRpb25zIGlmIHByb3ZpZGVkLlxuICAgKi9cbiAgY29uc3RydWN0b3Iob3B0aW9ucykge1xuICAgIHRoaXMudGFyZ2V0ID0gT2JqZWN0LmNyZWF0ZSh0YXJnZXQpXG4gICAgdGhpcy5vdmVybGF5ID0gT2JqZWN0LmNyZWF0ZShvdmVybGF5KVxuICAgIHRoaXMuaGFuZGxlciA9IE9iamVjdC5jcmVhdGUoaGFuZGxlcilcbiAgICB0aGlzLmJvZHkgPSBkb2N1bWVudC5ib2R5XG5cbiAgICB0aGlzLnNob3duID0gZmFsc2VcbiAgICB0aGlzLmxvY2sgPSBmYWxzZVxuICAgIHRoaXMucmVsZWFzZWQgPSB0cnVlXG4gICAgdGhpcy5sYXN0U2Nyb2xsUG9zaXRpb24gPSBudWxsXG4gICAgdGhpcy5wcmVzc1RpbWVyID0gbnVsbFxuXG4gICAgdGhpcy5vcHRpb25zID0gT2JqZWN0LmFzc2lnbih7fSwgREVGQVVMVF9PUFRJT05TLCBvcHRpb25zKVxuICAgIHRoaXMub3ZlcmxheS5pbml0KHRoaXMpXG4gICAgdGhpcy5oYW5kbGVyLmluaXQodGhpcylcbiAgfVxuXG4gIC8qKlxuICAgKiBNYWtlIGVsZW1lbnQocykgem9vbWFibGUuXG4gICAqIEBwYXJhbSAge3N0cmluZ3xFbGVtZW50fSBlbCBBIGNzcyBzZWxlY3RvciBvciBhbiBFbGVtZW50LlxuICAgKiBAcmV0dXJuIHt0aGlzfVxuICAgKi9cbiAgbGlzdGVuKGVsKSB7XG4gICAgaWYgKHR5cGVvZiBlbCA9PT0gJ3N0cmluZycpIHtcbiAgICAgIGNvbnN0IGVscyA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoZWwpXG4gICAgICBsZXQgaSA9IGVscy5sZW5ndGhcblxuICAgICAgd2hpbGUgKGktLSkge1xuICAgICAgICB0aGlzLmxpc3RlbihlbHNbaV0pXG4gICAgICB9XG4gICAgfSBlbHNlIGlmIChlbC50YWdOYW1lID09PSAnSU1HJykge1xuICAgICAgZWwuc3R5bGUuY3Vyc29yID0gY3Vyc29yLnpvb21JblxuICAgICAgbGlzdGVuKGVsLCAnY2xpY2snLCB0aGlzLmhhbmRsZXIuY2xpY2spXG5cbiAgICAgIGlmICh0aGlzLm9wdGlvbnMucHJlbG9hZEltYWdlKSB7XG4gICAgICAgIGxvYWRJbWFnZShnZXRPcmlnaW5hbFNvdXJjZShlbCkpXG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHRoaXNcbiAgfVxuXG4gIC8qKlxuICAgKiBVcGRhdGUgb3B0aW9ucyBvciByZXR1cm4gY3VycmVudCBvcHRpb25zIGlmIG5vIGFyZ3VtZW50IGlzIHByb3ZpZGVkLlxuICAgKiBAcGFyYW0gIHtPYmplY3R9IG9wdGlvbnMgQW4gT2JqZWN0IHRoYXQgY29udGFpbnMgdGhpcy5vcHRpb25zLlxuICAgKiBAcmV0dXJuIHt0aGlzfHRoaXMub3B0aW9uc31cbiAgICovXG4gIGNvbmZpZyhvcHRpb25zKSB7XG4gICAgaWYgKG9wdGlvbnMpIHtcbiAgICAgIE9iamVjdC5hc3NpZ24odGhpcy5vcHRpb25zLCBvcHRpb25zKVxuICAgICAgdGhpcy5vdmVybGF5LnVwZGF0ZVN0eWxlKHRoaXMub3B0aW9ucylcbiAgICAgIHJldHVybiB0aGlzXG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiB0aGlzLm9wdGlvbnNcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogT3BlbiAoem9vbSBpbikgdGhlIEVsZW1lbnQuXG4gICAqIEBwYXJhbSAge0VsZW1lbnR9IGVsIFRoZSBFbGVtZW50IHRvIG9wZW4uXG4gICAqIEBwYXJhbSAge0Z1bmN0aW9ufSBbY2I9dGhpcy5vcHRpb25zLm9uT3Blbl0gQSBjYWxsYmFjayBmdW5jdGlvbiB0aGF0IHdpbGxcbiAgICogYmUgY2FsbGVkIHdoZW4gYSB0YXJnZXQgaXMgb3BlbmVkIGFuZCB0cmFuc2l0aW9uIGhhcyBlbmRlZC4gSXQgd2lsbCBnZXRcbiAgICogdGhlIHRhcmdldCBlbGVtZW50IGFzIHRoZSBhcmd1bWVudC5cbiAgICogQHJldHVybiB7dGhpc31cbiAgICovXG4gIG9wZW4oZWwsIGNiID0gdGhpcy5vcHRpb25zLm9uT3Blbikge1xuICAgIGlmICh0aGlzLnNob3duIHx8IHRoaXMubG9jaykgcmV0dXJuXG5cbiAgICBjb25zdCB0YXJnZXQgPSB0eXBlb2YgZWwgPT09ICdzdHJpbmcnID8gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihlbCkgOiBlbFxuXG4gICAgaWYgKHRhcmdldC50YWdOYW1lICE9PSAnSU1HJykgcmV0dXJuXG5cbiAgICB0aGlzLm9wdGlvbnMub25CZWZvcmVPcGVuKHRhcmdldClcblxuICAgIHRoaXMudGFyZ2V0LmluaXQodGFyZ2V0LCB0aGlzKVxuXG4gICAgaWYgKCF0aGlzLm9wdGlvbnMucHJlbG9hZEltYWdlKSB7XG4gICAgICBjb25zdCB7IHNyY09yaWdpbmFsIH0gPSB0aGlzLnRhcmdldFxuXG4gICAgICBpZiAoc3JjT3JpZ2luYWwgIT0gbnVsbCkge1xuICAgICAgICB0aGlzLm9wdGlvbnMub25JbWFnZUxvYWRpbmcodGFyZ2V0KVxuICAgICAgICBsb2FkSW1hZ2Uoc3JjT3JpZ2luYWwsIHRoaXMub3B0aW9ucy5vbkltYWdlTG9hZGVkKVxuICAgICAgfVxuICAgIH1cblxuICAgIHRoaXMuc2hvd24gPSB0cnVlXG4gICAgdGhpcy5sb2NrID0gdHJ1ZVxuXG4gICAgdGhpcy50YXJnZXQuem9vbUluKClcbiAgICB0aGlzLm92ZXJsYXkuaW5zZXJ0KClcbiAgICB0aGlzLm92ZXJsYXkuZmFkZUluKClcblxuICAgIGxpc3Rlbihkb2N1bWVudCwgJ3Njcm9sbCcsIHRoaXMuaGFuZGxlci5zY3JvbGwpXG4gICAgbGlzdGVuKGRvY3VtZW50LCAna2V5ZG93bicsIHRoaXMuaGFuZGxlci5rZXlkb3duKVxuXG4gICAgaWYgKHRoaXMub3B0aW9ucy5jbG9zZU9uV2luZG93UmVzaXplKSB7XG4gICAgICBsaXN0ZW4od2luZG93LCAncmVzaXplJywgdGhpcy5oYW5kbGVyLnJlc2l6ZVdpbmRvdylcbiAgICB9XG5cbiAgICBjb25zdCBvbk9wZW5FbmQgPSAoKSA9PiB7XG4gICAgICBsaXN0ZW4odGFyZ2V0LCAndHJhbnNpdGlvbmVuZCcsIG9uT3BlbkVuZCwgZmFsc2UpXG4gICAgICB0aGlzLmxvY2sgPSBmYWxzZVxuICAgICAgdGhpcy50YXJnZXQudXBncmFkZVNvdXJjZSgpXG5cbiAgICAgIGlmICh0aGlzLm9wdGlvbnMuZW5hYmxlR3JhYikge1xuICAgICAgICB0b2dnbGVHcmFiTGlzdGVuZXJzKGRvY3VtZW50LCB0aGlzLmhhbmRsZXIsIHRydWUpXG4gICAgICB9XG5cbiAgICAgIGNiKHRhcmdldClcbiAgICB9XG5cbiAgICBsaXN0ZW4odGFyZ2V0LCAndHJhbnNpdGlvbmVuZCcsIG9uT3BlbkVuZClcblxuICAgIHJldHVybiB0aGlzXG4gIH1cblxuICAvKipcbiAgICogQ2xvc2UgKHpvb20gb3V0KSB0aGUgRWxlbWVudCBjdXJyZW50bHkgb3BlbmVkLlxuICAgKiBAcGFyYW0gIHtGdW5jdGlvbn0gW2NiPXRoaXMub3B0aW9ucy5vbkNsb3NlXSBBIGNhbGxiYWNrIGZ1bmN0aW9uIHRoYXQgd2lsbFxuICAgKiBiZSBjYWxsZWQgd2hlbiBhIHRhcmdldCBpcyBjbG9zZWQgYW5kIHRyYW5zaXRpb24gaGFzIGVuZGVkLiBJdCB3aWxsIGdldFxuICAgKiB0aGUgdGFyZ2V0IGVsZW1lbnQgYXMgdGhlIGFyZ3VtZW50LlxuICAgKiBAcmV0dXJuIHt0aGlzfVxuICAgKi9cbiAgY2xvc2UoY2IgPSB0aGlzLm9wdGlvbnMub25DbG9zZSkge1xuICAgIGlmICghdGhpcy5zaG93biB8fCB0aGlzLmxvY2spIHJldHVyblxuXG4gICAgY29uc3QgdGFyZ2V0ID0gdGhpcy50YXJnZXQuZWxcblxuICAgIHRoaXMub3B0aW9ucy5vbkJlZm9yZUNsb3NlKHRhcmdldClcblxuICAgIHRoaXMubG9jayA9IHRydWVcbiAgICB0aGlzLmJvZHkuc3R5bGUuY3Vyc29yID0gY3Vyc29yLmRlZmF1bHRcbiAgICB0aGlzLm92ZXJsYXkuZmFkZU91dCgpXG4gICAgdGhpcy50YXJnZXQuem9vbU91dCgpXG5cbiAgICBsaXN0ZW4oZG9jdW1lbnQsICdzY3JvbGwnLCB0aGlzLmhhbmRsZXIuc2Nyb2xsLCBmYWxzZSlcbiAgICBsaXN0ZW4oZG9jdW1lbnQsICdrZXlkb3duJywgdGhpcy5oYW5kbGVyLmtleWRvd24sIGZhbHNlKVxuXG4gICAgaWYgKHRoaXMub3B0aW9ucy5jbG9zZU9uV2luZG93UmVzaXplKSB7XG4gICAgICBsaXN0ZW4od2luZG93LCAncmVzaXplJywgdGhpcy5oYW5kbGVyLnJlc2l6ZVdpbmRvdywgZmFsc2UpXG4gICAgfVxuXG4gICAgY29uc3Qgb25DbG9zZUVuZCA9ICgpID0+IHtcbiAgICAgIGxpc3Rlbih0YXJnZXQsICd0cmFuc2l0aW9uZW5kJywgb25DbG9zZUVuZCwgZmFsc2UpXG5cbiAgICAgIHRoaXMuc2hvd24gPSBmYWxzZVxuICAgICAgdGhpcy5sb2NrID0gZmFsc2VcblxuICAgICAgdGhpcy50YXJnZXQuZG93bmdyYWRlU291cmNlKClcblxuICAgICAgaWYgKHRoaXMub3B0aW9ucy5lbmFibGVHcmFiKSB7XG4gICAgICAgIHRvZ2dsZUdyYWJMaXN0ZW5lcnMoZG9jdW1lbnQsIHRoaXMuaGFuZGxlciwgZmFsc2UpXG4gICAgICB9XG5cbiAgICAgIHRoaXMudGFyZ2V0LnJlc3RvcmVDbG9zZVN0eWxlKClcbiAgICAgIHRoaXMub3ZlcmxheS5yZW1vdmUoKVxuXG4gICAgICBjYih0YXJnZXQpXG4gICAgfVxuXG4gICAgbGlzdGVuKHRhcmdldCwgJ3RyYW5zaXRpb25lbmQnLCBvbkNsb3NlRW5kKVxuXG4gICAgcmV0dXJuIHRoaXNcbiAgfVxuXG4gIC8qKlxuICAgKiBHcmFiIHRoZSBFbGVtZW50IGN1cnJlbnRseSBvcGVuZWQgZ2l2ZW4gYSBwb3NpdGlvbiBhbmQgYXBwbHkgZXh0cmEgem9vbS1pbi5cbiAgICogQHBhcmFtICB7bnVtYmVyfSAgIHggVGhlIFgtYXhpcyBvZiB3aGVyZSB0aGUgcHJlc3MgaGFwcGVuZWQuXG4gICAqIEBwYXJhbSAge251bWJlcn0gICB5IFRoZSBZLWF4aXMgb2Ygd2hlcmUgdGhlIHByZXNzIGhhcHBlbmVkLlxuICAgKiBAcGFyYW0gIHtudW1iZXJ9ICAgc2NhbGVFeHRyYSBFeHRyYSB6b29tLWluIHRvIGFwcGx5LlxuICAgKiBAcGFyYW0gIHtGdW5jdGlvbn0gW2NiPXRoaXMub3B0aW9ucy5vbkdyYWJdIEEgY2FsbGJhY2sgZnVuY3Rpb24gdGhhdFxuICAgKiB3aWxsIGJlIGNhbGxlZCB3aGVuIGEgdGFyZ2V0IGlzIGdyYWJiZWQgYW5kIHRyYW5zaXRpb24gaGFzIGVuZGVkLiBJdFxuICAgKiB3aWxsIGdldCB0aGUgdGFyZ2V0IGVsZW1lbnQgYXMgdGhlIGFyZ3VtZW50LlxuICAgKiBAcmV0dXJuIHt0aGlzfVxuICAgKi9cbiAgZ3JhYih4LCB5LCBzY2FsZUV4dHJhID0gdGhpcy5vcHRpb25zLnNjYWxlRXh0cmEsIGNiID0gdGhpcy5vcHRpb25zLm9uR3JhYikge1xuICAgIGlmICghdGhpcy5zaG93biB8fCB0aGlzLmxvY2spIHJldHVyblxuXG4gICAgY29uc3QgdGFyZ2V0ID0gdGhpcy50YXJnZXQuZWxcblxuICAgIHRoaXMub3B0aW9ucy5vbkJlZm9yZUdyYWIodGFyZ2V0KVxuXG4gICAgdGhpcy5yZWxlYXNlZCA9IGZhbHNlXG4gICAgdGhpcy50YXJnZXQuZ3JhYih4LCB5LCBzY2FsZUV4dHJhKVxuXG4gICAgY29uc3Qgb25HcmFiRW5kID0gKCkgPT4ge1xuICAgICAgbGlzdGVuKHRhcmdldCwgJ3RyYW5zaXRpb25lbmQnLCBvbkdyYWJFbmQsIGZhbHNlKVxuICAgICAgY2IodGFyZ2V0KVxuICAgIH1cblxuICAgIGxpc3Rlbih0YXJnZXQsICd0cmFuc2l0aW9uZW5kJywgb25HcmFiRW5kKVxuXG4gICAgcmV0dXJuIHRoaXNcbiAgfVxuXG4gIC8qKlxuICAgKiBNb3ZlIHRoZSBFbGVtZW50IGN1cnJlbnRseSBncmFiYmVkIGdpdmVuIGEgcG9zaXRpb24gYW5kIGFwcGx5IGV4dHJhIHpvb20taW4uXG4gICAqIEBwYXJhbSAge251bWJlcn0gICB4IFRoZSBYLWF4aXMgb2Ygd2hlcmUgdGhlIHByZXNzIGhhcHBlbmVkLlxuICAgKiBAcGFyYW0gIHtudW1iZXJ9ICAgeSBUaGUgWS1heGlzIG9mIHdoZXJlIHRoZSBwcmVzcyBoYXBwZW5lZC5cbiAgICogQHBhcmFtICB7bnVtYmVyfSAgIHNjYWxlRXh0cmEgRXh0cmEgem9vbS1pbiB0byBhcHBseS5cbiAgICogQHBhcmFtICB7RnVuY3Rpb259IFtjYj10aGlzLm9wdGlvbnMub25Nb3ZlXSBBIGNhbGxiYWNrIGZ1bmN0aW9uIHRoYXRcbiAgICogd2lsbCBiZSBjYWxsZWQgd2hlbiBhIHRhcmdldCBpcyBtb3ZlZCBhbmQgdHJhbnNpdGlvbiBoYXMgZW5kZWQuIEl0IHdpbGxcbiAgICogZ2V0IHRoZSB0YXJnZXQgZWxlbWVudCBhcyB0aGUgYXJndW1lbnQuXG4gICAqIEByZXR1cm4ge3RoaXN9XG4gICAqL1xuICBtb3ZlKHgsIHksIHNjYWxlRXh0cmEgPSB0aGlzLm9wdGlvbnMuc2NhbGVFeHRyYSwgY2IgPSB0aGlzLm9wdGlvbnMub25Nb3ZlKSB7XG4gICAgaWYgKCF0aGlzLnNob3duIHx8IHRoaXMubG9jaykgcmV0dXJuXG5cbiAgICB0aGlzLnJlbGVhc2VkID0gZmFsc2VcbiAgICB0aGlzLmJvZHkuc3R5bGUuY3Vyc29yID0gY3Vyc29yLm1vdmVcbiAgICB0aGlzLnRhcmdldC5tb3ZlKHgsIHksIHNjYWxlRXh0cmEpXG5cbiAgICBjb25zdCB0YXJnZXQgPSB0aGlzLnRhcmdldC5lbFxuXG4gICAgY29uc3Qgb25Nb3ZlRW5kID0gKCkgPT4ge1xuICAgICAgbGlzdGVuKHRhcmdldCwgJ3RyYW5zaXRpb25lbmQnLCBvbk1vdmVFbmQsIGZhbHNlKVxuICAgICAgY2IodGFyZ2V0KVxuICAgIH1cblxuICAgIGxpc3Rlbih0YXJnZXQsICd0cmFuc2l0aW9uZW5kJywgb25Nb3ZlRW5kKVxuXG4gICAgcmV0dXJuIHRoaXNcbiAgfVxuXG4gIC8qKlxuICAgKiBSZWxlYXNlIHRoZSBFbGVtZW50IGN1cnJlbnRseSBncmFiYmVkLlxuICAgKiBAcGFyYW0gIHtGdW5jdGlvbn0gW2NiPXRoaXMub3B0aW9ucy5vblJlbGVhc2VdIEEgY2FsbGJhY2sgZnVuY3Rpb24gdGhhdFxuICAgKiB3aWxsIGJlIGNhbGxlZCB3aGVuIGEgdGFyZ2V0IGlzIHJlbGVhc2VkIGFuZCB0cmFuc2l0aW9uIGhhcyBlbmRlZC4gSXRcbiAgICogd2lsbCBnZXQgdGhlIHRhcmdldCBlbGVtZW50IGFzIHRoZSBhcmd1bWVudC5cbiAgICogQHJldHVybiB7dGhpc31cbiAgICovXG4gIHJlbGVhc2UoY2IgPSB0aGlzLm9wdGlvbnMub25SZWxlYXNlKSB7XG4gICAgaWYgKCF0aGlzLnNob3duIHx8IHRoaXMubG9jaykgcmV0dXJuXG5cbiAgICBjb25zdCB0YXJnZXQgPSB0aGlzLnRhcmdldC5lbFxuXG4gICAgdGhpcy5vcHRpb25zLm9uQmVmb3JlUmVsZWFzZSh0YXJnZXQpXG5cbiAgICB0aGlzLmxvY2sgPSB0cnVlXG4gICAgdGhpcy5ib2R5LnN0eWxlLmN1cnNvciA9IGN1cnNvci5kZWZhdWx0XG4gICAgdGhpcy50YXJnZXQucmVzdG9yZU9wZW5TdHlsZSgpXG5cbiAgICBjb25zdCBvblJlbGVhc2VFbmQgPSAoKSA9PiB7XG4gICAgICBsaXN0ZW4odGFyZ2V0LCAndHJhbnNpdGlvbmVuZCcsIG9uUmVsZWFzZUVuZCwgZmFsc2UpXG4gICAgICB0aGlzLmxvY2sgPSBmYWxzZVxuICAgICAgdGhpcy5yZWxlYXNlZCA9IHRydWVcbiAgICAgIGNiKHRhcmdldClcbiAgICB9XG5cbiAgICBsaXN0ZW4odGFyZ2V0LCAndHJhbnNpdGlvbmVuZCcsIG9uUmVsZWFzZUVuZClcblxuICAgIHJldHVybiB0aGlzXG4gIH1cbn1cblxuZnVuY3Rpb24gdG9nZ2xlR3JhYkxpc3RlbmVycyhlbCwgaGFuZGxlciwgYWRkKSB7XG4gIGNvbnN0IHR5cGVzID0gW1xuICAgICdtb3VzZWRvd24nLFxuICAgICdtb3VzZW1vdmUnLFxuICAgICdtb3VzZXVwJyxcbiAgICAndG91Y2hzdGFydCcsXG4gICAgJ3RvdWNobW92ZScsXG4gICAgJ3RvdWNoZW5kJ1xuICBdXG5cbiAgdHlwZXMuZm9yRWFjaChmdW5jdGlvbiB0b2dnbGVMaXN0ZW5lcih0eXBlKSB7XG4gICAgbGlzdGVuKGVsLCB0eXBlLCBoYW5kbGVyW3R5cGVdLCBhZGQpXG4gIH0pXG59XG4iXSwibmFtZXMiOlsiY3Vyc29yIiwiZGVmYXVsdCIsInpvb21JbiIsInpvb21PdXQiLCJncmFiIiwibW92ZSIsImxpc3RlbiIsImVsIiwiZXZlbnQiLCJoYW5kbGVyIiwiYWRkIiwib3B0aW9ucyIsInBhc3NpdmUiLCJhZGRFdmVudExpc3RlbmVyIiwicmVtb3ZlRXZlbnRMaXN0ZW5lciIsImxvYWRJbWFnZSIsInNyYyIsImNiIiwiaW1nIiwiSW1hZ2UiLCJvbmxvYWQiLCJvbkltYWdlTG9hZCIsImdldE9yaWdpbmFsU291cmNlIiwiZGF0YXNldCIsIm9yaWdpbmFsIiwicGFyZW50Tm9kZSIsInRhZ05hbWUiLCJnZXRBdHRyaWJ1dGUiLCJzZXRTdHlsZSIsInN0eWxlcyIsInJlbWVtYmVyIiwidHJhbnNpdGlvbiIsInZhbHVlIiwidHJhbnNmb3JtIiwicyIsInN0eWxlIiwia2V5IiwiYmluZEFsbCIsIl90aGlzIiwidGhhdCIsIm1ldGhvZHMiLCJPYmplY3QiLCJnZXRPd25Qcm9wZXJ0eU5hbWVzIiwiZ2V0UHJvdG90eXBlT2YiLCJmb3JFYWNoIiwiYmluZE9uZSIsIm1ldGhvZCIsImJpbmQiLCJub29wIiwiZW5hYmxlR3JhYiIsInByZWxvYWRJbWFnZSIsImNsb3NlT25XaW5kb3dSZXNpemUiLCJ0cmFuc2l0aW9uRHVyYXRpb24iLCJ0cmFuc2l0aW9uVGltaW5nRnVuY3Rpb24iLCJiZ0NvbG9yIiwiYmdPcGFjaXR5Iiwic2NhbGVCYXNlIiwic2NhbGVFeHRyYSIsInNjcm9sbFRocmVzaG9sZCIsInpJbmRleCIsImN1c3RvbVNpemUiLCJvbk9wZW4iLCJvbkNsb3NlIiwib25HcmFiIiwib25Nb3ZlIiwib25SZWxlYXNlIiwib25CZWZvcmVPcGVuIiwib25CZWZvcmVDbG9zZSIsIm9uQmVmb3JlR3JhYiIsIm9uQmVmb3JlUmVsZWFzZSIsIm9uSW1hZ2VMb2FkaW5nIiwib25JbWFnZUxvYWRlZCIsIlBSRVNTX0RFTEFZIiwiaW5pdCIsImluc3RhbmNlIiwiY2xpY2siLCJlIiwicHJldmVudERlZmF1bHQiLCJpc1ByZXNzaW5nTWV0YUtleSIsIndpbmRvdyIsIm9wZW4iLCJ0YXJnZXQiLCJzcmNPcmlnaW5hbCIsImN1cnJlbnRUYXJnZXQiLCJzaG93biIsInJlbGVhc2VkIiwiY2xvc2UiLCJyZWxlYXNlIiwic2Nyb2xsIiwiZG9jdW1lbnQiLCJkb2N1bWVudEVsZW1lbnQiLCJib2R5Iiwic2Nyb2xsTGVmdCIsInBhZ2VYT2Zmc2V0Iiwic2Nyb2xsVG9wIiwicGFnZVlPZmZzZXQiLCJsYXN0U2Nyb2xsUG9zaXRpb24iLCJ4IiwieSIsImRlbHRhWCIsImRlbHRhWSIsInRocmVzaG9sZCIsIk1hdGgiLCJhYnMiLCJrZXlkb3duIiwiaXNFc2NhcGUiLCJtb3VzZWRvd24iLCJpc0xlZnRCdXR0b24iLCJjbGllbnRYIiwiY2xpZW50WSIsInByZXNzVGltZXIiLCJzZXRUaW1lb3V0IiwiZ3JhYk9uTW91c2VEb3duIiwibW91c2Vtb3ZlIiwibW91c2V1cCIsImNsZWFyVGltZW91dCIsInRvdWNoc3RhcnQiLCJ0b3VjaGVzIiwiZ3JhYk9uVG91Y2hTdGFydCIsInRvdWNobW92ZSIsInRvdWNoZW5kIiwiaXNUb3VjaGluZyIsImNsaWNrT3ZlcmxheSIsInJlc2l6ZVdpbmRvdyIsImJ1dHRvbiIsIm1ldGFLZXkiLCJjdHJsS2V5IiwidGFyZ2V0VG91Y2hlcyIsImxlbmd0aCIsImNvZGUiLCJrZXlDb2RlIiwiY3JlYXRlRWxlbWVudCIsInBhcmVudCIsInBvc2l0aW9uIiwidG9wIiwibGVmdCIsInJpZ2h0IiwiYm90dG9tIiwib3BhY2l0eSIsInVwZGF0ZVN0eWxlIiwiYmFja2dyb3VuZENvbG9yIiwiaW5zZXJ0IiwiYXBwZW5kQ2hpbGQiLCJyZW1vdmUiLCJyZW1vdmVDaGlsZCIsImZhZGVJbiIsIm9mZnNldFdpZHRoIiwiZmFkZU91dCIsIlRSQU5TTEFURV9aIiwic3JjVGh1bWJuYWlsIiwic3Jjc2V0IiwicmVjdCIsImdldEJvdW5kaW5nQ2xpZW50UmVjdCIsInRyYW5zbGF0ZSIsInNjYWxlIiwic3R5bGVPcGVuIiwic3R5bGVDbG9zZSIsImNhbGN1bGF0ZVRyYW5zbGF0ZSIsImNhbGN1bGF0ZVNjYWxlIiwiaGVpZ2h0Iiwid2lkdGgiLCJ3aW5kb3dDZW50ZXIiLCJnZXRXaW5kb3dDZW50ZXIiLCJkeCIsImR5IiwicmVzdG9yZUNsb3NlU3R5bGUiLCJyZXN0b3JlT3BlblN0eWxlIiwidXBncmFkZVNvdXJjZSIsInJlbW92ZUF0dHJpYnV0ZSIsInRlbXAiLCJjbG9uZU5vZGUiLCJzZXRBdHRyaWJ1dGUiLCJ2aXNpYmlsaXR5IiwidXBkYXRlU3JjIiwiZG93bmdyYWRlU291cmNlIiwidGFyZ2V0Q2VudGVyIiwiem9vbWluZ0hlaWdodCIsInpvb21pbmdXaWR0aCIsInRhcmdldEhhbGZXaWR0aCIsInRhcmdldEhhbGZIZWlnaHQiLCJ0YXJnZXRFZGdlVG9XaW5kb3dFZGdlIiwic2NhbGVIb3Jpem9udGFsbHkiLCJzY2FsZVZlcnRpY2FsbHkiLCJtaW4iLCJuYXR1cmFsV2lkdGgiLCJuYXR1cmFsSGVpZ2h0IiwibWF4Wm9vbWluZ1dpZHRoIiwicGFyc2VGbG9hdCIsIm1heFpvb21pbmdIZWlnaHQiLCJkb2NFbCIsIndpbmRvd1dpZHRoIiwiY2xpZW50V2lkdGgiLCJpbm5lcldpZHRoIiwid2luZG93SGVpZ2h0IiwiY2xpZW50SGVpZ2h0IiwiaW5uZXJIZWlnaHQiLCJab29taW5nIiwiY29uc3RydWN0b3IiLCJjcmVhdGUiLCJvdmVybGF5IiwibG9jayIsImFzc2lnbiIsIkRFRkFVTFRfT1BUSU9OUyIsImVscyIsInF1ZXJ5U2VsZWN0b3JBbGwiLCJpIiwiY29uZmlnIiwicXVlcnlTZWxlY3RvciIsIm9uT3BlbkVuZCIsInRvZ2dsZUdyYWJMaXN0ZW5lcnMiLCJvbkNsb3NlRW5kIiwib25HcmFiRW5kIiwib25Nb3ZlRW5kIiwib25SZWxlYXNlRW5kIiwidHlwZXMiLCJ0b2dnbGVMaXN0ZW5lciIs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
