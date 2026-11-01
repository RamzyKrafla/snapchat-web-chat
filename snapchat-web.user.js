// ==UserScript==
// @name         Snapchat Web without Spotlight
// @description  Hides Spotlight in Snapchat for Web and keeps the phone redirect from winning when desktop mode is on.
// @match        *://*.snapchat.com/*
// @run-at       document-start
// @inject-into  content
// @noframes
// ==/UserScript==

(function () {
  "use strict";

  // Snapchat web bundle 13.79.0 (revision 96e7c68f, built 2026-10-26).
  // Module 54127 sends /web/ to /web/mobile-landing.html when this matches
  // navigator.userAgent. Supported browsers, from the same bundle:
  // Chrome >= 97, Edge >= 97, Safari >= 16.
  var PHONE_UA = /Mobi|iP(hone|od|ad)|Android|BlackBerry|IEMobile|Kindle|NetFront|Silk-Accelerated|(hpw|web)OS|Fennec|Minimo|Opera M(obi|ini)|Blazer|Dolfin|Dolphin|Skyfire|Zune/i;
  var DESKTOP_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15";
  var SPOTLIGHT = /spotlight/i;

  function isPhoneUA(ua) {
    return PHONE_UA.test(String(ua || ""));
  }

  function isSpotlightControl(info) {
    var aria = info.aria || "";
    var title = info.title || "";
    var href = info.href || "";
    var text = info.text || "";
    var fullText = info.fullText || "";
    if (SPOTLIGHT.test(aria) || SPOTLIGHT.test(title) || SPOTLIGHT.test(href)) return true;
    if (text.length > 0 && text.length <= 40 && SPOTLIGHT.test(text)) return true;
    // Marketing cards put "Open Spotlight" under a longer sentence and link to the web app.
    return info.interactive === true && fullText.length > 0 && fullText.length <= 160 && /\bopen spotlight\b/i.test(fullText);
  }

  function buildPageWorldSource() {
    return [
      "(function(){",
      "var desktop=" + JSON.stringify(DESKTOP_UA) + ";",
      "var mobile=" + PHONE_UA.toString() + ";",
      "try{",
      "if(mobile.test(navigator.userAgent)){",
      "var get=function(){return desktop;};",
      "Object.defineProperty(Navigator.prototype,'userAgent',{configurable:true,get:get});",
      "Object.defineProperty(Navigator.prototype,'appVersion',{configurable:true,get:function(){return desktop.replace(/^Mozilla\\//,'');}});",
      "}",
      "}catch(e){}",
      "try{",
      "if(!mobile.test(navigator.userAgent)){",
      "var block=function(url){return /mobile-landing/i.test(String(url||''));};",
      "var replace=Location.prototype.replace;",
      "Location.prototype.replace=function(url){if(block(url))return;return replace.call(this,url);};",
      "var assign=Location.prototype.assign;",
      "Location.prototype.assign=function(url){if(block(url))return;return assign.call(this,url);};",
      "}",
      "}catch(e){}",
      "})();"
    ].join("");
  }

  var api = {
    isPhoneUA: isPhoneUA,
    isSpotlightControl: isSpotlightControl,
    desktopUA: DESKTOP_UA,
    pageWorldSource: buildPageWorldSource
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;

  // Safari can run this at document-start, before <html> exists. Returning there
  // drops the whole blocker, so installation waits until the document element appears.
  function install() {
    if (install.done) return;
    if (typeof document === "undefined" || !document.documentElement) return;
    install.done = true;

  function ownText(el) {
    var text = "";
    var nodes = el.childNodes;
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].nodeType === 3) text += nodes[i].nodeValue;
    }
    return text.replace(/\s+/g, " ").trim();
  }

  function describe(el) {
    var tag = el.tagName;
    var interactive = tag === "A" || tag === "BUTTON" || el.getAttribute("role") === "button" || el.getAttribute("role") === "tab" || el.getAttribute("role") === "link";
    var fullText = "";
    if (interactive && el.innerText) fullText = el.innerText.replace(/\s+/g, " ").trim();
    return {
      aria: el.getAttribute("aria-label") || "",
      title: el.getAttribute("title") || "",
      href: el.getAttribute("href") || "",
      text: ownText(el),
      fullText: fullText,
      interactive: interactive
    };
  }

  function hideControl(el) {
    var target = el.closest("a, button, [role='button'], [role='tab'], [role='link']") || el;
    if (target.getAttribute("data-spotlight-blocked") === "1") return;
    target.setAttribute("data-spotlight-blocked", "1");
    target.hidden = true;
    target.style.setProperty("display", "none", "important");
    target.style.setProperty("pointer-events", "none", "important");
    if (target.tagName === "A") target.removeAttribute("href");
  }

  function walk(root, found) {
    if (!root || !root.querySelectorAll) return;
    var nodes = root.querySelectorAll("a, button, [role='button'], [role='tab'], [role='link'], [aria-label], [title]");
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (isSpotlightControl(describe(el))) found.push(el);
      if (el.shadowRoot) walk(el.shadowRoot, found);
    }
  }

  function sweep() {
    var found = [];
    walk(document, found);
    for (var i = 0; i < found.length; i++) hideControl(found[i]);
    if (/\/spotlight(\/|$)/i.test(location.pathname)) location.replace("https://www.snapchat.com/web/");
  }

  function showDesktopHint() {
    if (location.pathname.indexOf("mobile-landing") === -1) return;
    if (document.getElementById("snap-desktop-hint")) return;
    var hint = document.createElement("div");
    hint.id = "snap-desktop-hint";
    hint.textContent = "Safari is still identifying as a phone. Turn on Settings, Safari, Request Desktop Website, All Websites. Then open www.snapchat.com/web again.";
    hint.style.cssText = "position:fixed;left:12px;right:12px;bottom:12px;z-index:2147483647;background:#16191c;color:#fff;padding:14px 16px;border-radius:12px;font:600 15px/1.35 -apple-system,sans-serif;";
    (document.body || document.documentElement).appendChild(hint);
  }

  function installPagePretend() {
    try {
      var blob = new Blob([buildPageWorldSource()], { type: "text/javascript" });
      var script = document.createElement("script");
      script.src = URL.createObjectURL(blob);
      script.async = false;
      var parent = document.head || document.documentElement;
      parent.insertBefore(script, parent.firstChild);
    } catch (err) {
      // Snapchat's page script still runs. Desktop Website mode is the reliable identity switch.
    }
  }

  var queued = false;
  function scheduleSweep() {
    if (queued) return;
    queued = true;
    var runner = window.requestAnimationFrame || function (fn) { return setTimeout(fn, 16); };
    runner(function () {
      queued = false;
      sweep();
      showDesktopHint();
    });
  }

  installPagePretend();

  var style = document.createElement("style");
  style.textContent = "a[href*='spotlight' i],a[href*='Spotlight']{display:none !important;}";
  document.documentElement.appendChild(style);

  document.addEventListener("click", function (event) {
    var path = event.composedPath ? event.composedPath() : [event.target];
    for (var i = 0; i < path.length; i++) {
      var node = path[i];
      if (!node || node.nodeType !== 1) continue;
      if (node.getAttribute && node.getAttribute("data-spotlight-blocked") === "1") {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (isSpotlightControl(describe(node))) {
        event.preventDefault();
        event.stopPropagation();
        hideControl(node);
        return;
      }
    }
  }, true);

  new MutationObserver(scheduleSweep).observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["title", "aria-label", "href"]
  });
  document.addEventListener("DOMContentLoaded", scheduleSweep);
  scheduleSweep();
  }

  if (typeof document !== "undefined") {
    install();
    if (!install.done) {
      document.addEventListener("DOMContentLoaded", install);
      var waiting = new MutationObserver(function () {
        install();
        if (install.done) waiting.disconnect();
      });
      waiting.observe(document, { childList: true, subtree: true });
    }
  }
})();
