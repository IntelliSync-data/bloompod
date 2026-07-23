(() => {
    const t = se => {
        window.parent.postMessage(se, "*"),
            console.log(se)
    }
        , e = "__ANIMA_DBG__"
        , n = console.log.bind(console)
        , r = console.error.bind(console)
        , i = [];
    let o = null;
    const s = [];
    let a = null;
    const l = se => {
        if (se === void 0)
            return "undefined";
        if (se === null)
            return "null";
        if (typeof se == "string")
            return se;
        if (se instanceof Error)
            return `${se.name}: ${se.message}`;
        try {
            return JSON.stringify(se, null, 2)
        } catch {
            return String(se)
        }
    }
        , c = (se, ae) => {
            const be = `${se}
${ae || ""}`;
            return be.includes("chrome-extension://") || be.includes("moz-extension://")
        }
        , u = (se, ae, be) => {
            const B = ae.map(l).join(" ").slice(0, 2e3);
            c(B, be) || (i.push({
                level: se,
                message: B,
                stack: be,
                timestamp: Date.now()
            }),
                i.length > 50 && i.shift(),
                d())
        }
        , d = () => {
            o || (o = setTimeout(() => {
                i.length > 0 && (t({
                    type: "console-errors",
                    payload: {
                        entries: [...i]
                    }
                }),
                    i.length = 0),
                    o = null
            }
                , 500))
        }
        , f = se => {
            const ae = se.map(l).join(" ").slice(0, 1e3);
            ae.startsWith(e) && (s.push({
                message: ae,
                timestamp: Date.now()
            }),
                s.length > 120 && s.shift(),
                h())
        }
        , h = () => {
            a || (a = setTimeout(() => {
                s.length > 0 && (t({
                    type: "runtime-debug-logs",
                    payload: {
                        entries: [...s]
                    }
                }),
                    s.length = 0),
                    a = null
            }
                , 300))
        }
        ;
    console.log = (...se) => {
        n(...se),
            f(se)
    }
        ,
        console.error = (...se) => {
            r(...se),
                u("error", se, new Error().stack)
        }
        ,
        window.addEventListener("error", se => {
            u("exception", [se.message], se.error?.stack)
        }
        ),
        window.addEventListener("unhandledrejection", se => {
            const ae = se.reason instanceof Error ? se.reason.message : String(se.reason)
                , be = se.reason?.stack ?? "";
            u("unhandledrejection", [ae], be)
        }
        );
    const m = async () => window.html2canvas ? window.html2canvas : new Promise((se, ae) => {
        const be = document.createElement("script");
        be.src = "https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js",
            be.onload = () => {
                se(window.html2canvas)
            }
            ,
            be.onerror = () => {
                ae(new Error("Failed to load html2canvas"))
            }
            ,
            document.head.appendChild(be)
    }
    );
    let p = window.location.pathname;
    t({
        type: "preview-navigate",
        payload: {
            destinationPathname: p
        }
    }),
        window.navigation && window.navigation.addEventListener("currententrychange", () => {
            const ae = new URL(window.navigation.currentEntry?.url ?? "").pathname;
            ae !== p && window.scrollTo(0, 0),
                p = ae,
                t({
                    type: "preview-navigate",
                    payload: {
                        destinationPathname: ae
                    }
                })
        }
        ),
        window.document.querySelectorAll("a").forEach(se => se.addEventListener("click", ae => {
            const B = ae.currentTarget.getAttribute("href");
            if (!B || B.startsWith("#") || /^(https?:)?\/\//.test(B) || !B.endsWith(".html"))
                return;
            const Oe = new URL(B, window.location.href);
            t({
                type: "preview-navigate",
                payload: {
                    destinationPathname: Oe.pathname
                }
            })
        }
        ));
    let y;
    window.addEventListener("scroll", () => {
        t({
            type: "preview-scroll"
        }),
            clearTimeout(y),
            y = setTimeout(() => {
                t({
                    type: "preview-scroll-stop",
                    payload: {
                        scrollX: window.scrollX,
                        scrollY: window.scrollY
                    }
                })
            }
                , 150)
    }
    ),
        new MutationObserver(se => {
            for (const be of se)
                for (const B of be.addedNodes)
                    B instanceof HTMLIFrameElement && B.style.position === "fixed" && setTimeout(() => {
                        try {
                            const Oe = B.contentDocument?.body?.textContent ?? "";
                            (Oe.includes("chrome-extension://") || Oe.includes("moz-extension://")) && B.remove()
                        } catch { }
                    }
                        , 150);
            const ae = document.documentElement.querySelector("vite-error-overlay");
            if (ae?.shadowRoot) {
                const be = ae.shadowRoot.querySelector('[part="message-body"]')?.textContent ?? ""
                    , B = be.split(": ")[1]?.split(/\(\d+:\d+\)/)[0]
                    , Oe = ae.shadowRoot.querySelector('[part="file"]')?.textContent ?? ""
                    , Te = ae.shadowRoot.querySelector('[part="frame"]')?.textContent ?? "";
                t({
                    type: "on-preview-error",
                    payload: {
                        message: B || be,
                        file: Oe,
                        frame: Te
                    }
                });
                const ge = ae.shadowRoot.querySelector('[part="tip"]');
                if (ge) {
                    const de = document.createElement("button");
                    de.textContent = "Try to fix",
                        de.onclick = () => {
                            t({
                                type: "try-to-fix-preview-error",
                                payload: {
                                    message: B || be,
                                    file: Oe,
                                    frame: Te
                                }
                            })
                        }
                        ,
                        ge.replaceChildren(de)
                }
            }
        }
        ).observe(document, {
            attributes: !1,
            childList: !0,
            subtree: !0
        });
    const v = se => {
        const ae = new URL(se, window.location.href)
            , be = new URL(window.location.href);
        return ae.origin !== be.origin
    }
        ;
    if (document.addEventListener("click", se => {
        if (window._isSelectionAreaEnabled) {
            se.preventDefault(),
                se.stopPropagation();
            return
        }
        const ae = se.target?.closest("a");
        ae && ae.href && v(ae.href) && (se.preventDefault(),
            se.stopPropagation(),
            t({
                type: "open-external-link",
                payload: {
                    url: ae.href
                }
            }))
    }
        , !0),
        !window._selectionArea) {
        const se = document.createElement("style");
        se.textContent = `.selected {
  outline: 2px solid #9c7dff !important;
  background-color: rgba(156, 125, 255, 0.5) !important;
}

.hovered-pre-selected {
  outline: 2px solid #9c7dff !important;
  background-color: rgba(213, 205, 249, 0.5) !important;
}

.inline-selected {
  outline: 2px dashed #9c7dff !important;
  background-color: transparent !important;
}

.inline-hovered-pre-selected {
  outline: 2px solid #9c7dff;
  background-color: rgba(213, 205, 249, 0.3);
}

.inline-locked {
  outline: 2px solid #9c7dff !important;
  background-color: rgba(213, 205, 249, 0.3) !important;
  position: relative;
}

.inline-locked::before {
  content: 'Text linked to DB or code. Ask AI to edit.' !important;
  position: absolute !important;
  bottom: 100% !important;
  left: -2px !important;
  margin-bottom: 2px !important;
  background-color: #242424 !important;
  color: white !important;
  padding: 2px 6px !important;
  font-size: 10px !important;
  font-weight: 600 !important;
  border-radius: 2px !important;
  pointer-events: none !important;
  z-index: 10000 !important;
  white-space: nowrap !important;
  line-height: 1.2 !important;
  font-family:
    system-ui,
    -apple-system,
    sans-serif !important;
}


`,
            document.head.appendChild(se),
            window._inspectorStyleElement = se;
        const ae = document.createElement("script");
        ae.type = "module",
            ae.textContent = `// @ts-nocheck
// This script is imported as raw text and injected into the preview iframe
// THIS SHOULD BE JS ONLY
(async () => {
  const { default: SelectionArea } = await import('https://cdn.jsdelivr.net/npm/@viselect/vanilla/dist/viselect.mjs');

  const HOSTED_ASSETS_CDN_URL = 'https://c.animaapp.com';

  // Extract hosted image URLs from an element and its descendants
  const extractHostedImageUrls = (element) => {
    const urls = [];

    // Check if the element itself is an img
    if (element.tagName === 'IMG') {
      const src = element.getAttribute('src');
      if (src?.startsWith(HOSTED_ASSETS_CDN_URL)) {
        urls.push(src);
      }
    }

    // Find all img descendants
    const images = element.querySelectorAll('img');
    images.forEach((img) => {
      const src = img.getAttribute('src');
      if (src?.startsWith(HOSTED_ASSETS_CDN_URL)) {
        urls.push(src);
      }
    });

    // Return deduplicated URLs
    return [...new Set(urls)];
  };

  const getNonDescendantElements = (elements) => {
    return elements.filter((element) => {
      // Check if any other element in the list is an ancestor of the current element.
      return !elements.some((otherElement) => {
        return otherElement !== element && otherElement.contains(element);
      });
    });
  };

  try {
    const selection = new SelectionArea({
      selectables: ['div', 'span', 'img', 'a', 'button', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'section', 'header'],
      boundaries: ['#animaInspectorOverlay'], // crucial to capture the whole scrollable area
      behaviour: {
        triggers: [0],
        intersect: 'cover',
      },
    })
      .on('beforestart', ({ event }) => {
        event.stopImmediatePropagation();
        event.preventDefault();
      })
      .on('start', ({ store, event }) => {
        // Stop click handlers on regular native buttons.
        event.stopImmediatePropagation();
        event.preventDefault();
        // Due to hover behavior, there could be an element with "selected" class that's not in the store. Clean it up as well.
        document
          .querySelectorAll('body .hovered-pre-selected')
          .forEach((el) => el.classList.remove('hovered-pre-selected'));
        if (!event.ctrlKey && !event.metaKey) {
          store.stored.forEach((el) => el.classList.remove('selected'));
          selection.clearSelection();

          window._selectionInProgress = true;
        }
      })
      .on(
        'move',
        ({
          store: {
            changed: { added, removed },
          },
        }) => {
          added.forEach((el) => el.classList.add('selected'));
          removed.forEach((el) => el.classList.remove('selected'));
        },
      )
      .on('stop', ({ store }) => {
        const nonDescendantElements = getNonDescendantElements(
          store.stored.filter((el) => !el.classList.contains('selection-area')),
        );

        // remove selected class from non-selected elements
        store.stored.forEach((el) => {
          if (!nonDescendantElements.includes(el)) {
            el.classList.remove('selected');
          }
        });

        const selectedElements = nonDescendantElements.map((el) => {
          return {
            tagName: el.tagName,
            id: el.id,
            className: el.className,
            textContent: el.textContent.length > 100 ? el.textContent.substring(0, 100) + '...' : el.textContent,
            parentTagName: el.parentElement?.tagName,
            hostedImageUrls: extractHostedImageUrls(el),
          };
        });

        // Store selecteionInProgress so we can inhibit our mouseover and mouseout event listeners (see below)
        window._selectionInProgress = false;

        const message = {
          type: 'inspector-state-changed',
          payload: {
            selectedElements,
            isInspectorEnabled: true,
          },
        };

        if (!window._isSelectionAreaEnabled) {
          return;
        }

        window.parent.postMessage(message, '*');

        console.log(message);
      });

    // Store the selection instance in the window object for later access
    window._selectionArea = selection;
    window._selectionInProgress = false;
    window._selectionArea.disable();

    // In case new elements get added to the DOM as we scroll
    window.addEventListener('scroll', () => {
      window._selectionArea?.resolveSelectables();
    });
  } catch (error) {
    console.error('Error initializing SelectionArea:', error);
  }
})();


// @ts-nocheck
// This script is imported as raw text and injected into the preview iframe
// THIS SHOULD BE JS ONLY

(async () => {
  const { default: SelectionArea } = await import('https://cdn.jsdelivr.net/npm/@viselect/vanilla/dist/viselect.mjs');

  const HOSTED_ASSETS_CDN_URL = 'https://c.animaapp.com';

  // Extract hosted image URLs from an element and its descendants
  const extractHostedImageUrls = (element) => {
    const urls = [];

    // Check if the element itself is an img
    if (element.tagName === 'IMG') {
      const src = element.getAttribute('src');
      if (src?.startsWith(HOSTED_ASSETS_CDN_URL)) {
        urls.push(src);
      }
    }

    // Find all img descendants
    const images = element.querySelectorAll('img');
    images.forEach((img) => {
      const src = img.getAttribute('src');
      if (src?.startsWith(HOSTED_ASSETS_CDN_URL)) {
        urls.push(src);
      }
    });

    // Return deduplicated URLs
    return [...new Set(urls)];
  };

  const getNonDescendantElements = (elements) => {
    return elements.filter((element) => {
      // Check if any other element in the list is an ancestor of the current element.
      return !elements.some((otherElement) => {
        return otherElement !== element && otherElement.contains(element);
      });
    });
  };

  function makeEditableAndFocus(element) {
    // Make the element content-editable
    element.contentEditable = 'true';

    // Focus the element
    element.focus();

    // Place cursor at the end of the content
    const range = document.createRange();
    const selection = window.getSelection();

    // If the element has child nodes, place cursor at the end
    if (element.childNodes.length > 0) {
      range.setStart(
        element.childNodes[element.childNodes.length - 1],
        element.childNodes[element.childNodes.length - 1]?.textContent?.length ?? 0,
      );
    } else {
      range.setStart(element, 0);
    }

    range.collapse(true);
    selection?.removeAllRanges();
    selection?.addRange(range);
  }

  try {
    const inlineSelection = new SelectionArea({
      selectables: ['div', 'span', 'img', 'a', 'button', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'section', 'header'],
      boundaries: ['#animaInspectorOverlay'], // crucial to capture the whole scrollable area
      behaviour: {
        triggers: [0],
        intersect: 'cover',
      },
    })
      .on('beforestart', ({ event }) => {
        event.stopImmediatePropagation();
        event.preventDefault();
      })
      .on('start', ({ store, event }) => {
        // Stop click handlers on regular native buttons.
        event.stopImmediatePropagation();
        event.preventDefault();
        // Due to hover behavior, there could be an element with "selected" class that's not in the store. Clean it up as well.
        document
          .querySelectorAll('body .hovered-pre-selected')
          .forEach((el) => el.classList.remove('hovered-pre-selected'));
        if (!event.ctrlKey && !event.metaKey) {
          store.stored.forEach((el) => el.classList.remove('selected'));
          inlineSelection.clearSelection();

          window._selectionInProgress = true;
        }
      })
      .on(
        'move',
        ({
          store: {
            changed: { added, removed },
          },
        }) => {
          added.forEach((el) => el.classList.add('selected'));
          removed.forEach((el) => el.classList.remove('selected'));
        },
      )
      .on('stop', ({ store }) => {
        const nonDescendantElements = getNonDescendantElements(
          store.stored.filter((el) => !el.classList.contains('selection-area')),
        );

        // remove selected class from non-selected elements
        store.stored.forEach((el) => {
          if (!nonDescendantElements.includes(el)) {
            el.classList.remove('selected');
          }
        });

        const selectedElements = nonDescendantElements.map((el) => {
          return {
            tagName: el.tagName,
            id: el.id,
            className: el.className,
            textContent: el.textContent.length > 100 ? el.textContent.substring(0, 100) + '...' : el.textContent,
            parentTagName: el.parentElement?.tagName,
            hostedImageUrls: extractHostedImageUrls(el),
          };
        });

        // Store selecteionInProgress so we can inhibit our mouseover and mouseout event listeners (see below)
        window._selectionInProgress = false;

        const message = {
          type: 'inline-editor-state-changed',
          payload: {
            selectedElements,
            isInlineEditorEnabled: true,
          },
        };

        const el = nonDescendantElements[0];
        if (el) {
          makeEditableAndFocus(el);
        }

        window.parent.postMessage(message, '*');

        console.log(message);
      });

    // Store the selection instance in the window object for later access
    window._inlineSelectionArea = inlineSelection;
    window._selectionInProgress = false;
    window._inlineSelectionArea.disable();

    // In case new elements get added to the DOM as we scroll
    window.addEventListener('scroll', () => {
      window._inlineSelectionArea?.resolveSelectables();
    });
  } catch (error) {
    console.error('Error initializing _inlineSelectionArea:', error);
  }
})();
`,
            document.head.appendChild(ae),
            window._inspectorScriptElement = ae,
            window._isSelectionAreaEnabled = !1,
            window._isInlineSelectionAreaEnabled = !1,
            document.body && (document.body.style.userSelect = "unset"),
            t({
                type: "inspector-state-changed",
                payload: {
                    selectedElements: [],
                    isInspectorEnabled: !1
                }
            }),
            t({
                type: "inline-editor-state-changed",
                payload: {
                    selectedElements: [],
                    isInlineEditorEnabled: !1
                }
            })
    }
    let b = null
        , w = null;
    const S = ["div", "span", "img", "a", "button", "p", "h1", "h2", "h3", "h4", "h5", "h6", "section", "header"]
        , k = se => {
            let ae = se;
            for (; ae && ae !== document.body;) {
                if (S.includes(ae.tagName.toLowerCase()))
                    return ae.closest("body") ? ae : null;
                ae = ae.parentElement
            }
            return null
        }
        , x = se => {
            if (window._selectionInProgress)
                return;
            const ae = k(se.target);
            if (ae && !ae.classList.contains("hovered-pre-selected")) {
                if (window._selectionArea.getSelection().includes(ae))
                    return;
                ae.classList.add("hovered-pre-selected")
            }
        }
        , E = se => {
            if (window._selectionInProgress)
                return;
            const ae = k(se.target);
            if (ae?.classList.contains("hovered-pre-selected")) {
                if (window._selectionArea.getSelection().includes(ae))
                    return;
                ae.classList.remove("hovered-pre-selected")
            }
        }
        , R = (se, ae) => {
            ae.style.cssText = se.style.cssText,
                ae.classList.add(...se.classList),
                se.classList = "",
                se.style.cssText = ""
        }
        , $ = se => {
            se.preventDefault()
        }
        , z = "data-anima-original-tw"
        , T = ["pointer-events-none"]
        , U = se => {
            const ae = se.querySelectorAll("*");
            [se, ...Array.from(ae)].forEach(be => {
                const B = T.filter(Oe => be.classList.contains(Oe));
                B.length > 0 && (be.setAttribute(z, B.join(" ")),
                    B.forEach(Oe => be.classList.remove(Oe)))
            }
            )
        }
        , C = se => {
            const ae = se.querySelectorAll(`[${z}]`);
            (se.hasAttribute(z) ? [se, ...Array.from(ae)] : Array.from(ae)).forEach(B => {
                const Oe = B.getAttribute(z);
                Oe && (Oe.split(" ").forEach(Te => B.classList.add(Te)),
                    B.removeAttribute(z))
            }
            )
        }
        , K = se => {
            if (!(se instanceof Element))
                return "";
            const ae = [];
            let be = se;
            for (; be && be.nodeType === 1 && be !== document.documentElement;) {
                const B = be.tagName.toLowerCase()
                    , Oe = be.id ? "#" + be.id : ""
                    , Te = be.classList && be.classList.length > 0 ? "." + Array.from(be.classList).join(".") : "";
                let ge = B + Oe + Te;
                if (!Oe) {
                    const de = be.parentElement;
                    if (de && Array.from(de.children).filter(Le => Le.tagName === be.tagName).length > 1) {
                        const Le = Array.from(de.children).indexOf(be) + 1;
                        ge += `:nth-child(${Le})`
                    }
                }
                if (ae.unshift(ge),
                    be = be.parentElement,
                    Oe)
                    break
            }
            return ae.join(" > ")
        }
        , H = se => se.trim()
        , N = se => {
            se.contentEditable = "plaintext-only",
                se.style.caretColor = "#ffffff",
                se.focus();
            const ae = document.createRange()
                , be = window.getSelection();
            try {
                ae.selectNodeContents(se),
                    ae.collapse(!1),
                    be?.removeAllRanges(),
                    be?.addRange(ae)
            } catch (B) {
                console.error("Failed to position caret:", B)
            }
        }
        , X = "https://c.animaapp.com"
        , L = se => {
            const ae = [];
            if (se.tagName === "IMG") {
                const B = se.getAttribute("src");
                B?.startsWith(X) && ae.push(B)
            }
            return se.querySelectorAll("img").forEach(B => {
                const Oe = B.getAttribute("src");
                Oe?.startsWith(X) && ae.push(Oe)
            }
            ),
                [...new Set(ae)]
        }
        , J = () => {
            const se = window._inlineEditorActiveEl;
            if (!se)
                return null;
            const ae = window._inlineEditorOriginalText ?? ""
                , be = se.innerText ?? se.textContent ?? "";
            se.contentEditable = "false";
            const B = H(ae)
                , Oe = H(be);
            if (B === Oe)
                return window._inlineEditorActiveEl = null,
                    window._inlineEditorOriginalText = "",
                    null;
            const Te = {
                selector: K(se),
                tagName: se.tagName,
                id: se.id,
                className: se.className,
                beforeText: ae,
                afterText: be,
                dataUid: se.getAttribute("data-uid") || void 0,
                fallbackFilePath: se.getAttribute("data-inline-editor-file-path") || void 0,
                timestamp: Date.now()
            };
            return se.removeAttribute("data-inline-editor-file-path"),
                window._inlineEditorEdits = Array.isArray(window._inlineEditorEdits) ? window._inlineEditorEdits : [],
                window._inlineEditorEdits.push(Te),
                window._inlineEditorActiveEl = null,
                window._inlineEditorOriginalText = "",
                Te
        }
        , M = se => {
            if (window._selectionInProgress)
                return;
            const ae = k(se.target);
            if (ae && !ae.classList.contains("inline-hovered-pre-selected")) {
                const be = Array.from(ae.childNodes)
                    , B = be.some(Te => Te.nodeType === Node.ELEMENT_NODE)
                    , Oe = be.some(Te => Te.nodeType === Node.TEXT_NODE && !!Te.textContent?.trim());
                if (B && !Oe)
                    return;
                ae.classList.add("inline-hovered-pre-selected")
            }
        }
        , V = se => {
            if (window._selectionInProgress)
                return;
            const ae = k(se.target);
            ae?.classList.contains("inline-hovered-pre-selected") && ae.classList.remove("inline-hovered-pre-selected")
        }
        , te = se => {
            if (!window._isInlineSelectionAreaEnabled)
                return;
            const ae = k(se.target);
            if (!ae || ae.tagName.toLowerCase() === "img" || (se.target?.closest("a") && (se.preventDefault(),
                se.stopPropagation()),
                window._inlineEditorActiveEl && window._inlineEditorActiveEl !== ae && (J(),
                    window._inlineEditorActiveEl?.classList.remove("inline-selected")),
                window._inlineEditorActiveEl === ae))
                return;
            document.querySelectorAll(".inline-locked").forEach($e => $e.classList.remove("inline-locked"));
            const B = Array.from(ae.childNodes)
                , Oe = B.some($e => $e.nodeType === Node.ELEMENT_NODE)
                , Te = B.some($e => $e.nodeType === Node.TEXT_NODE && !!$e.textContent?.trim());
            if (Oe && !Te || ae.classList.contains("inline-locked"))
                return;
            const ge = ae.getAttribute("data-uid");
            if (!ge) {
                ae.classList.add("inline-locked");
                return
            }
            const de = ae.innerText ?? ae.textContent ?? "";
            de.trim() && (window._pendingInlineElement = ae,
                t({
                    type: "check-text-exists",
                    payload: {
                        text: de.trim(),
                        elementId: ge
                    }
                }))
        }
        , ie = (se, ae, be, B) => {
            const Oe = window._pendingInlineElement;
            if (!Oe || (Oe.getAttribute("data-uid") || "") !== (ae || ""))
                return;
            if (window._pendingInlineElement = null,
                !se) {
                Oe.classList.add("inline-locked");
                return
            }
            B ? Oe.setAttribute("data-inline-editor-file-path", B) : Oe.removeAttribute("data-inline-editor-file-path"),
                window._inlineEditorActiveEl = Oe;
            const Te = Oe.innerText ?? Oe.textContent ?? "";
            window._inlineEditorOriginalText = Te,
                Oe.classList.add("inline-selected"),
                N(Oe);
            const ge = () => {
                const Le = J();
                if (Oe.classList.remove("inline-selected"),
                    Oe.classList.remove("inline-locked"),
                    Oe.removeEventListener("blur", ge, !0),
                    Le) {
                    const Ue = Array.isArray(window._inlineEditorEdits) ? window._inlineEditorEdits : [];
                    t({
                        type: "inline-editor-state-changed",
                        payload: {
                            selectedElements: [],
                            isInlineEditorEnabled: !0,
                            edits: Ue,
                            hasPendingEdits: !0
                        }
                    })
                }
            }
                ;
            Oe.addEventListener("blur", ge, !0);
            const de = [{
                tagName: Oe.tagName,
                id: Oe.id,
                className: Oe.className,
                textContent: (Oe.textContent ?? "").length > 100 ? (Oe.textContent ?? "").substring(0, 100) + "..." : Oe.textContent ?? "",
                parentTagName: Oe.parentElement?.tagName ?? "",
                hostedImageUrls: L(Oe)
            }]
                , $e = Array.isArray(window._inlineEditorEdits) ? window._inlineEditorEdits : [];
            t({
                type: "inline-editor-state-changed",
                payload: {
                    selectedElements: de,
                    isInlineEditorEnabled: !0,
                    edits: $e.length > 0 ? $e : void 0,
                    hasPendingEdits: $e.length > 0
                }
            })
        }
        , le = () => {
            document.addEventListener("mouseover", M, !0),
                document.addEventListener("mouseout", V, !0),
                document.addEventListener("click", te, !0)
        }
        , je = () => {
            document.removeEventListener("mouseover", M, !0),
                document.removeEventListener("mouseout", V, !0),
                document.removeEventListener("click", te, !0),
                document.querySelectorAll("body .inline-hovered-pre-selected").forEach(se => se.classList.remove("inline-hovered-pre-selected")),
                document.querySelectorAll("body .inline-selected").forEach(se => se.classList.remove("inline-selected")),
                document.querySelectorAll("body .inline-locked").forEach(se => se.classList.remove("inline-locked"))
        }
        , Ce = async () => {
            const se = {
                removeScripts: !1,
                maxImportDepth: 5,
                fetchCredentials: "include"
            }
                , ae = document.baseURI
                , be = (Be, ot) => {
                    try {
                        return new URL(Be, ot).href
                    } catch {
                        return Be
                    }
                }
                , B = () => {
                    const Be = document.doctype;
                    if (!Be)
                        return "";
                    const ot = Be.publicId ? ` PUBLIC "${Be.publicId}"` : ""
                        , ce = !Be.publicId && Be.systemId ? " SYSTEM" : ""
                        , I = Be.systemId ? ` "${Be.systemId}"` : "";
                    return `<!DOCTYPE ${Be.name}${ot}${ce}${I}>`
                }
                , Oe = (Be, ot) => Be.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (ce, I, Q) => {
                    const ue = Q.trim();
                    return /^(data:|blob:|https?:|file:|#)/i.test(ue) ? ce : `url("${be(ue, ot)}")`
                }
                )
                , Te = async (Be, ot, ce, I) => {
                    if (I <= 0)
                        return Be;
                    const Q = /@import\s+(?:url\(\s*)?(?:(["'])(.*?)\1|(.*?))(?:\s*\))?\s*([^;]*);/gi;
                    let ue = "", xe = 0, ye;
                    for (; (ye = Q.exec(Be)) !== null;) {
                        ue += Be.slice(xe, ye.index),
                            xe = Q.lastIndex;
                        const Re = ye[2]
                            , he = (ye[3] || "").trim()
                            , tt = (ye[4] || "").trim()
                            , Ge = Re || he;
                        if (!Ge) {
                            ue += ye[0];
                            continue
                        }
                        const q = be(Ge, ot);
                        if (ce.has(q)) {
                            ue += `/* Skipped duplicate @import: ${q} */
`;
                            continue
                        }
                        ce.add(q);
                        try {
                            const qe = await fetch(q, {
                                credentials: se.fetchCredentials
                            });
                            if (!qe.ok)
                                throw new Error(`HTTP ${qe.status}`);
                            let Ye = await qe.text();
                            Ye = await Te(Ye, q, ce, I - 1),
                                Ye = Oe(Ye, q),
                                ue += tt ? `
@media ${tt} {
${Ye}
}
` : `
${Ye}
`
                        } catch (qe) {
                            console.warn("Could not inline @import:", q, qe),
                                ue += `@import url("${q}") ${tt};
`
                        }
                    }
                    return ue += Be.slice(xe),
                        ue
                }
                , ge = async Be => {
                    try {
                        if (Be && Be.cssRules)
                            return Array.from(Be.cssRules).map(ot => ot.cssText).join(`
`)
                    } catch { }
                    if (Be && Be.href)
                        try {
                            const ot = await fetch(Be.href, {
                                credentials: se.fetchCredentials
                            });
                            if (!ot.ok)
                                throw new Error(`HTTP ${ot.status}`);
                            return await ot.text()
                        } catch (ot) {
                            return console.warn("Could not fetch stylesheet:", Be.href, ot),
                                null
                        }
                    return ""
                }
                , de = Be => {
                    const ot = Be && Be.ownerNode;
                    return (ot && ot.getAttribute && ot.getAttribute("media") || Be && Be.media && Be.media.mediaText || "" || "").trim()
                }
                , $e = (Be, ot) => {
                    const ce = [["a", "href"], ["img", "src"], ["source", "src"], ["iframe", "src"], ["video", "src"], ["audio", "src"], ["track", "src"], ["form", "action"], ["script", "src"], ["link", "href"]];
                    for (const [I, Q] of ce)
                        Be.querySelectorAll(`${I}[${Q}]`).forEach(ue => {
                            const xe = ue.getAttribute(Q);
                            xe && (/^(data:|blob:|https?:|file:|mailto:|tel:|#)/i.test(xe) || ue.setAttribute(Q, be(xe, ot)))
                        }
                        );
                    Be.querySelectorAll("[srcset]").forEach(I => {
                        const Q = I.getAttribute("srcset");
                        if (!Q)
                            return;
                        const ue = Q.split(",").map(xe => xe.trim()).filter(Boolean).map(xe => {
                            const ye = xe.split(/\s+/);
                            return ye[0] = be(ye[0], ot),
                                ye.join(" ")
                        }
                        );
                        I.setAttribute("srcset", ue.join(", "))
                    }
                    )
                }
                , Le = []
                , Ue = new Set;
            for (const Be of Array.from(document.styleSheets)) {
                const ot = de(Be)
                    , ce = Be.href || ae;
                let I = await ge(Be);
                I === null ? I = `/* Could not inline stylesheet due to cross-origin restrictions: ${Be.href} */
@import url("${be(Be.href || "", ae)}");
` : (I = await Te(I, ce, Ue, se.maxImportDepth),
                    I = Oe(I, ce)),
                    Le.push({
                        cssText: I,
                        mediaText: ot
                    })
            }
            const Pe = document.documentElement.cloneNode(!0)
                , Se = document.implementation.createHTMLDocument("")
                , Ie = Se.importNode(Pe, !0);
            Se.replaceChild(Ie, Se.documentElement);
            const De = Se.documentElement;
            let Xe = De.querySelector("head");
            if (Xe || (Xe = Se.createElement("head"),
                De.insertBefore(Xe, De.firstChild)),
                De.querySelectorAll('link[rel~="stylesheet"], style').forEach(Be => Be.remove()),
                De.querySelectorAll("meta[http-equiv]").forEach(Be => {
                    (Be.getAttribute("http-equiv") || "").toLowerCase() === "content-security-policy" && Be.remove()
                }
                ),
                !Xe.querySelector("base")) {
                const Be = Se.createElement("base");
                Be.href = ae,
                    Xe.insertBefore(Be, Xe.firstChild)
            }
            for (const { cssText: Be, mediaText: ot } of Le) {
                const ce = Se.createElement("style");
                ce.setAttribute("data-inlined-by", "extractHTML"),
                    ot && ce.setAttribute("media", ot),
                    ce.appendChild(Se.createTextNode(Be || "")),
                    Xe.appendChild(ce)
            }
            return $e(De, ae),
                `${B()}
${De.outerHTML}
`
        }
        ;
    if (window.addEventListener("message", async se => {
        if (!(se.data && typeof se.data == "object" && se.data.type)) {
            console.log("event.data doesn't exist");
            return
        }
        const ae = se.data
            , be = document.querySelector("body");
        switch (w = document.querySelector("#animaInspectorOverlay"),
        w || (w = document.createElement("div"),
            w.id = "animaInspectorOverlay"),
        ae.type) {
            case "on-sandpack-success":
                {
                    history.replaceState({
                        idx: 0
                    }, "", window.location.href);
                    break
                }
            case "navigate-back":
                {
                    history.back();
                    break
                }
            case "navigate-forward":
                {
                    history.forward();
                    break
                }
            case "navigate-to":
                {
                    let { destinationPathname: B } = ae.payload;
                    B && !B.startsWith("/") && (B = "/" + B),
                        B.endsWith(".html") ? (window.location.href = B,
                            t({
                                type: "preview-navigate",
                                payload: {
                                    destinationPathname: B
                                }
                            })) : (history.pushState(null, B, B),
                                window.dispatchEvent(new PopStateEvent("popstate")));
                    break
                }
            case "toggle-inspector":
                {
                    window._isSelectionAreaEnabled ? (b?.append(...w.childNodes),
                        b && w && R(w, b),
                        be.removeChild(w),
                        C(document.body),
                        window._selectionArea.disable(),
                        document.querySelectorAll(".selected").forEach(B => B.classList.remove("selected")),
                        window._selectionArea.clearSelection(),
                        window._isSelectionAreaEnabled = !1,
                        document.body && (document.body.style.userSelect = "unset"),
                        t({
                            type: "inspector-state-changed",
                            payload: {
                                selectedElements: [],
                                isInspectorEnabled: !1
                            }
                        })) : (U(document.body),
                            b = document.body.childElementCount === 1 ? document.body.children[0] : document.querySelector("body"),
                            w.append(...b?.childNodes || []),
                            b && w && R(b, w),
                            be.appendChild(w),
                            window._selectionArea.enable(),
                            window._isSelectionAreaEnabled = !0,
                            w?.addEventListener("click", $),
                            w?.addEventListener("mouseover", x),
                            w?.addEventListener("mouseout", E),
                            document.body && (document.body.style.userSelect = "none"),
                            t({
                                type: "inspector-state-changed",
                                payload: {
                                    selectedElements: [],
                                    isInspectorEnabled: !0
                                }
                            }));
                    break
                }
            case "confirm-inline-edits":
                {
                    try {
                        (window._inlineEditorAssignedEls || []).forEach(Oe => Oe.removeAttribute("data-inline-editor-id"))
                    } catch { }
                    window._inlineEditorAssignedEls = [],
                        window._inlineEditorEdits = [],
                        window._inlineEditorActiveEl = null,
                        window._inlineEditorOriginalText = "";
                    break
                }
            case "text-exists-result":
                {
                    const { exists: B, elementId: Oe, totalOccurrences: Te, filePath: ge } = ae.payload;
                    ie(B, Oe, Te, ge);
                    break
                }
            case "toggle-inline-editor":
                {
                    if (window._isInlineSelectionAreaEnabled) {
                        J(),
                            document.querySelectorAll(".inline-selected").forEach(Oe => {
                                Oe.contentEditable = "false",
                                    Oe.classList.remove("inline-selected")
                            }
                            ),
                            je();
                        const B = Array.isArray(window._inlineEditorEdits) ? window._inlineEditorEdits : [];
                        window._isInlineSelectionAreaEnabled = !1,
                            document.body && (document.body.style.userSelect = "unset"),
                            console.log("[inline-editor] Toggling off, edits:", B),
                            t({
                                type: "inline-editor-state-changed",
                                payload: {
                                    selectedElements: [],
                                    isInlineEditorEnabled: !1,
                                    edits: B,
                                    hasPendingEdits: B.length > 0
                                }
                            })
                    } else
                        window._inlineEditorEdits = [],
                            window._inlineEditorActiveEl = null,
                            window._inlineEditorOriginalText = "",
                            window._inlineEditorAssignedEls = [],
                            window._isInlineSelectionAreaEnabled = !0,
                            le(),
                            document.body && (document.body.style.userSelect = "unset"),
                            t({
                                type: "inline-editor-state-changed",
                                payload: {
                                    selectedElements: [],
                                    isInlineEditorEnabled: !0
                                }
                            });
                    break
                }
            case "take-screenshot":
                {
                    if (!!document.querySelector("vite-error-overlay")) {
                        t({
                            type: "screenshot-taken",
                            payload: {
                                imageData: null
                            }
                        });
                        break
                    }
                    try {
                        const ge = (await (await m())(document.body, {
                            useCORS: !0,
                            allowTaint: !1,
                            scale: .5,
                            logging: !1
                        })).toDataURL("image/jpeg", .7);
                        t({
                            type: "screenshot-taken",
                            payload: {
                                imageData: ge
                            }
                        })
                    } catch (Oe) {
                        console.error("Screenshot failed:", Oe),
                            t({
                                type: "screenshot-taken",
                                payload: {
                                    imageData: null
                                }
                            })
                    }
                    break
                }
            case "restore-scroll-position":
                {
                    const { scrollX: B, scrollY: Oe } = ae.payload
                        , Te = 5e3
                        , ge = () => {
                            const Le = Math.max(0, document.documentElement.scrollWidth - window.innerWidth)
                                , Ue = Math.max(0, document.documentElement.scrollHeight - window.innerHeight)
                                , Pe = Math.min(B, Le)
                                , Se = Math.min(Oe, Ue)
                                , Ie = Pe > 0 || Se > 0;
                            return Ie && window.scrollTo({
                                left: Pe,
                                top: Se,
                                behavior: "smooth"
                            }),
                                Ie
                        }
                        ;
                    if (ge())
                        break;
                    const de = new ResizeObserver(() => {
                        ge() && (de.disconnect(),
                            clearTimeout($e))
                    }
                    );
                    de.observe(document.documentElement);
                    const $e = setTimeout(() => {
                        de.disconnect();
                        const Le = Math.max(0, document.documentElement.scrollWidth - window.innerWidth)
                            , Ue = Math.max(0, document.documentElement.scrollHeight - window.innerHeight)
                            , Pe = Math.min(B, Le)
                            , Se = Math.min(Oe, Ue);
                        (Pe > 0 || Se > 0) && window.scrollTo({
                            left: Pe,
                            top: Se,
                            behavior: "smooth"
                        })
                    }
                        , Te);
                    break
                }
            case "extract-html":
                {
                    try {
                        const B = await Ce();
                        t({
                            type: "html-extracted",
                            payload: {
                                html: B
                            }
                        })
                    } catch (B) {
                        console.error("HTML extraction failed:", B),
                            t({
                                type: "html-extracted",
                                payload: {
                                    html: null
                                }
                            })
                    }
                    break
                }
        }
    }
    ),
        document.documentElement.setAttribute("ready", "false"),
        new ResizeObserver(se => {
            for (const ae of se)
                if (ae.target === document.documentElement) {
                    let be = document.documentElement.getAttribute("ready") === "true";
                    const B = ae.contentRect.width
                        , Oe = ae.contentRect.height;
                    (B > 0 || Oe > 0) && !be && (document.documentElement.setAttribute("ready", "true"),
                        be = !0),
                        setTimeout(() => {
                            const Te = !!document.documentElement.querySelector("vite-error-overlay");
                            t({
                                type: "preview-resize",
                                payload: {
                                    isReady: be,
                                    hasError: Te
                                }
                            })
                        }
                            , 500)
                }
        }
        ).observe(document.documentElement),
        !window.anima) {
        const se = document.createElement("script");
        se.src = "https://unpkg.com/@animaapp/playground-sdk@0",
            document.head.appendChild(se)
    }
    const W = "mmecsxxiYHNtag";
    if (!W.startsWith("$$$") && !window.__ANIMA_PLAYGROUND_ID__) {
        const se = document.createElement("script");
        se.textContent = `window.__ANIMA_PLAYGROUND_ID__ = "${W}";`,
            document.head.appendChild(se)
    }
    const re = "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJleHAiOjE4MDQzMDUyOTAsImlhdCI6MTc3Mjc2OTI5MCwibmJmIjoxNzcyNzY5MjkwLCJpZGVudGl0eSI6IjY5MTYwMmY0ZjAzNmY2MTNjMTRlNTA5YiJ9.yea8tMqCv6bhdiO4jYY0Z6nzsXlTGc50aQDopZfwIE4";
    if (!re.startsWith("$$$") && !window.__ANIMA_TOKEN__) {
        const se = document.createElement("script");
        se.textContent = `window.__ANIMA_TOKEN__ = "${re}";`,
            document.head.appendChild(se)
    }
}
)()
