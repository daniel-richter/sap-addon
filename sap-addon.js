let sap = {
    github: { hostname: "github.wdf.sap.corp" },
    portal: { hostname: "portal.wdf.sap.corp", pathnamesFrom: ["/", "/home"], pathnameTo: "/irj/portal" }
};

sap.github.flashNoticeQueries = [
    ".flash.flash-full.js-notice.flash-warn.flash-length-limited"
];

sap.github.hideFlashNotice = function () {
    _setDisplayAttrOfMatchingElements(sap.github.flashNoticeQueries, "none");
};

sap.github.showFlashNotice = function () {
    _setDisplayAttrOfMatchingElements(sap.github.flashNoticeQueries, "");
};

let _setDisplayAttrOfMatchingElements = function (queries, displayValue) {
    for (let query of queries) {
        document.querySelector(query).style.display = displayValue;
    }
};

sap.portal.redirect = function () {
    window.location.replace(sap.portal.pathnameTo);
};

let executeFunctionAfterPageLoaded = function (func, args=[]) {
    window.addEventListener("load", (e) => {
        func(...args);
    });
    if (document.readyState === "complete") {
        // is it possible that page is loaded before event listener is registered?
        func(...args);
    }
};

let options = {};
let loadOptionsFromStorage = async function () {
    return new Promise(async function (resolve, reject) {
        browser.storage.local.get("options").then(res => {
            options = res.options;
            resolve();
        });
    });
};

let url = new URL(window.location.href);

async function main () {
    await loadOptionsFromStorage();
    if (url.hostname === sap.github.hostname) {
        if (!options || options["github-hide-notice"] !== false) {
            executeFunctionAfterPageLoaded(sap.github.hideFlashNotice);
        } else {
            executeFunctionAfterPageLoaded(sap.github.showFlashNotice);
        }
    } else if (url.hostname === sap.portal.hostname && sap.portal.pathnamesFrom.includes(url.pathname)) {
        if (!options || options["portal-redirect"] !== false) {
            sap.portal.redirect();
        }
    }
};
main();
browser.runtime.onConnect.addListener(() => {
    console.log("onConnect");
    main();
});
