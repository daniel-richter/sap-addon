let usePromisesForAsync = false;
if (typeof browser !== "undefined") {
    usePromisesForAsync = true;
} else {
    window.browser = chrome;
}
let url = new URL(window.location.href);

let github = {
    signIn: {
        optionName: "github-sign-in",
        query: "a[href^='/login?']",
        signInOtherTabQuery: ".js-stale-session-flash-signed-in a",
    },
    flashNotice: {
        optionName: "github-hide-notice",
        query: ".flash.flash-full.js-notice.flash-warn.flash-length-limited",
    },
    showNames: {
        optionName: "github-show-names",
        query: `.user-mention,
            [data-hovercard-type=user],
            a.text-emphasized.link-gray-dark,
            .merge-status-item.review-item.bg-white.js-details-container.Details strong.text-emphasized,
            small a.text-gray-dark`,
        regexNameOnProfilePage: `<span class="p-name vcard-fullname d-block overflow-hidden" itemprop="name">([^<]*)</span>`,
    },
    getNamesFromPeople: {
        optionName: "github-get-names-from-people",
        hostname: "people.wdf.sap.corp",
        regexNameOnProfilePage: `<span class='salutation'>[^<]*</span>([^<]*)<`,
    },
};

class DOMObserver {
    constructor () {
        this.observerCallbacks = {};
        let that = this;
        this.observer = new MutationObserver(function (mutation, _observer) {
            for (let id in that.observerCallbacks) {
                that.observerCallbacks[id](mutation, _observer);
            }
        });
        this.observer.observe(document, {
            childList: true,
            characterData: true,
            subtree: true
        });
    }

    registerCallbackFunction (id, callback) {
        if (!this.observerCallbacks[id]) {
            this.observerCallbacks[id] = callback;
        }
    }

    unregisterCallbackFunction (id) {
        this.observerCallbacks[id] = undefined;
    }
}
const domObserver = new DOMObserver();

github.signIn.signIn = function () {
    executeFunctionAfterPageLoaded(function () {
        github.signIn.getSignInButtonAndClick();
    });

    domObserver.registerCallbackFunction(github.signIn.optionName,
    function (mutations, _observer) {
        for (let { target } of mutations) {
            github.signIn.getSignInButtonAndClick(target);
        }
    });
};
github.signIn.getSignInButtonAndClick = function (element) {
    element = element || document;
    let signInBtn = element.querySelector(github.signIn.query);
    if (signInBtn) { signInBtn.click(); }
};
github.signIn.stopAutoSignIn = function () {
    domObserver.unregisterCallbackFunction(github.signIn.optionName);
};
github.signIn.listenForSignInOtherTab = function () {
    /* when also non-active tabs are notified that settings changed and user
     * should get signed in, these tabs will be redirected to
     * github.wdf.sap.corp/saml/consume which throws a 404
     * -> only regularly checking works, maybe can be combined with mutation observer
     */
    setInterval(async function () {
        await loadOptionsFromStorage();
        if (isEnabled(github.signIn.optionName)) {
            let signInBtn = document.querySelector(github.signIn.signInOtherTabQuery);
            if (signInBtn) {
                let r = signInBtn.getBoundingClientRect();
                if (r.width !== 0 && r.height !== 0) {
                    signInBtn.click();
                }
            }
        }
    }, 2500);
};

github.flashNotice.hide = function () {
    executeFunctionAfterPageLoaded(function () {
        _hideElementsByQuery(github.flashNotice.query);
    });

    domObserver.registerCallbackFunction(github.flashNotice.optionName,
    function (mutations, _observer) {
        for (let { target } of mutations) {
            _hideElementsByQuery(github.flashNotice.query, target);
        }
    });
};

github.flashNotice.show = function () {
    domObserver.unregisterCallbackFunction(github.flashNotice.optionName);
    executeFunctionAfterPageLoaded(function () {
        _showElementsByQuery(github.flashNotice.query);
    });
};

let _hideElementsByQuery = function (query, baseElement) {
    _setDisplayAttributeForElementsByQuery(query, baseElement, "none");
};

let _showElementsByQuery = function (query, baseElement) {
    _setDisplayAttributeForElementsByQuery(query, baseElement, "");
};

let _setDisplayAttributeForElementsByQuery = function (query, baseElement, displayValue) {
    baseElement = baseElement || document;
    for (let element of baseElement.querySelectorAll(query)) {
        element.style.display = displayValue;
    }
};

github.showNames.replaceIds = function () {
    executeFunctionAfterPageLoaded(function () {
        /* execute once in cases where observer is not registered before
         * elements are changed/created (e.g. gets enabled in options)
         */
        github.showNames._replaceAllChildsWhichAreUserId(document.body);
        saveUsernameCacheToStorage();
    });

    domObserver.registerCallbackFunction(github.showNames.optionName,
    function (mutations, _observer) {
        for (let { target } of mutations) {
            github.showNames._replaceAllChildsWhichAreUserId(target);
        }
        saveUsernameCacheToStorage();
    });
};
github.showNames.showIdsAgain = function () {
    domObserver.unregisterCallbackFunction(github.showNames.optionName);
    for (let element of document.querySelectorAll("[data-sap-addon-user-id]")) {
        element.textContent = element.getAttribute("data-sap-addon-user-id");
        element.removeAttribute("data-sap-addon-user-id");
    }
};
github.showNames._replaceAllChildsWhichAreUserId = function (element) {
    for (let queryMatch of element.querySelectorAll(github.showNames.query)) {
        github.showNames._replaceElementIfUserId(queryMatch);
    }
};
github.showNames._replaceElementIfUserId = async function (element) {
    const {userId, prefix} = github.showNames._getUserIdIfElementIsUserId(element);
    if (userId) {
        let username = await github.showNames._getUsername(userId);
        if (username) {
            let el = getDirectParentOfText(element, prefix + userId);
            el.textContent = prefix + username;
            el.setAttribute("data-sap-addon-user-id", prefix + userId);
        }
    }
};
github.showNames._getUserIdIfElementIsUserId = function (element) {
    let userId = (!element.hasAttribute("data-sap-addon-user-id")
            && !element.querySelector("[data-sap-addon-user-id]"))
            ? element.textContent.trim() : null;
    if (userId === "" || !isElementALink(element)) {
        if (!github.showNames._hrefExceptionForReviewer(element)) {
            userId = null;
        }
    }
    if (userId && element.classList.contains("user-mention") && userId.startsWith("@")) {
        return { prefix: "@", userId: userId.substr(1) };
    }
    return { prefix: "", userId };
};

github.showNames._getUsername = async function (userId) {
    let user = usernameCache[userId];
    if (user && user.username) {
        usernameCache[userId].usedAt = getUnixTimestamp();
        usernameCache[userId].used += 1;
        return user.username;
    } else {
        let username = await github.showNames._fetchUsername(userId);
        if (username) {
            usernameCache[userId] = {
                username: username,
                updatedAt: getUnixTimestamp(),
                usedAt: getUnixTimestamp(),
                used: 1,
            };
        }
        return username;
    }
};

github.showNames._fetchUsername = function (userId) {
    return new Promise(async function (resolve, reject) {
        if (isEnabled(github.getNamesFromPeople.optionName)) {
            let url = "https://" + github.getNamesFromPeople.hostname + "/profiles/" + userId;
            fetch(url, {
                method: "GET",
                cache: "force-cache"
            }).then(response => response.text())
            .then(html => {
                const searchRegex = new RegExp(github.getNamesFromPeople.regexNameOnProfilePage);
                let match = searchRegex.exec(html)[1];
                /* currently the salutation is not in the span which is named
                 * salutation but direclty in front of the name -> we need
                 * to split that away
                 * e.g.: <span class='salutation'></span>Mr. Firstname Lastname
                 */
                match = match.split(". ").pop().trim();
                resolve(match);
            }).catch(error => {
                github.showNames._logFetchError(userId, url, error);
            });
        }

        // use github as fallback or if people is disabled
        let url = "https://" + url.hostname + "/" + userId;
        fetch(url, {
            method: "GET",
            cache: "force-cache"
        }).then(response => response.text())
        .then(html => {
            const searchRegex = new RegExp(github.showNames.regexNameOnProfilePage);
            const match = searchRegex.exec(html)[1];
            resolve(match);
        }).catch(error => {
            github.showNames._logFetchError(userId, url, error);
            resolve(null); // reject?
        });
    });
};

github.showNames._logFetchError = function (userId, url, error) {
    if ((new RegExp(`[di]\d{6}|c\d{7}`, "i")).exec(userId)) {
        // only logs error when it looks like a correct userId
        // either d/D/i/I + 6 numbers or c/C + 7 numbers
        console.log("SAP Addon - Error when fetching", url, error);
    }
};

github.showNames._hrefExceptionForReviewer = function (element) {
    // reviewer (approval / pending) don't have a link to the user -> therefore exception needs to be added
    if (element.classList.contains("text-emphasized")
        && element.parentElement
        && element.parentElement.parentElement
        && element.parentElement.parentElement.querySelector("[data-hovercard-type=user]")) {
        return true;
    }
};



let getUnixTimestamp = function () {
    return Math.floor((new Date()).getTime());
};

let isElementALink = function (element) {
    // check childs
    for (let linkChild of element.querySelectorAll("[href]")) {
        if (linkChild && element.textContent.trim() === linkChild.textContent.trim()) {
            return true;
        }
    }
    // check parents
    while (true) {
        if (!element) return false;
        if (element.hasAttribute("href")) return true;
        element = element.parentElement;
    }
};

let getDirectParentOfText = function (baseElement, text) {
    if (baseElement.childNodes.length === 1
        && baseElement.firstChild.nodeName === "#text"
        && baseElement.textContent.trim() === text) {
        return baseElement;
    } else {
        for (let child of baseElement.childNodes) {
            if (child.childNodes.length > 0) {
                let r = getDirectParentOfText(child, text);
                if (r) {
                    return r;
                }
            }
        }
    }
};

let redirectToURL = function (url) {
    window.location.replace(url);
};

let executeFunctionAfterPageLoaded = function (func, args=[]) {
    window.addEventListener("load", (e) => {
        func(...args);
    });
    if (document.readyState === "complete") {
        func(...args);
    }
};

let options = {};
let loadOptionsFromStorage = async function () {
    return new Promise(async function (resolve, reject) {
        function onLocalStorageGet (res) {
            options = res.options;
            resolve();
        }
        if (usePromisesForAsync) {
            browser.storage.local.get("options").then(onLocalStorageGet);
        } else {
            browser.storage.local.get("options", onLocalStorageGet);
        }
    });
};

let isEnabled = function (optionName) {
    return !options || options[optionName] !== false; // enabled per default
};

let usernameCache = undefined;
let loadUsernameCacheFromStorage = async function () {
    return new Promise(async function (resolve, reject) {
        function onLocalStorageGet (res) {
            usernameCache = res.usernameCache || {};
            resolve();
        }
        if (usePromisesForAsync) {
            browser.storage.local.get("usernameCache").then(onLocalStorageGet);
        } else {
            browser.storage.local.get("usernameCache", onLocalStorageGet);
        }
    });
};

let saveUsernameCacheToStorage = function () {
    browser.storage.local.set({usernameCache: usernameCache});
};

async function main () {
    await Promise.all([
        loadUsernameCacheFromStorage(),
        loadOptionsFromStorage(),
    ]);

    if (isEnabled(github.signIn.optionName)) {
        github.signIn.signIn();
    } else {
        github.signIn.stopAutoSignIn();
    }
    github.signIn.listenForSignInOtherTab();
    if (isEnabled(github.flashNotice.optionName)) {
        github.flashNotice.hide();
    } else {
        github.flashNotice.show();
    }
    if (isEnabled(github.showNames.optionName)) {
        github.showNames.replaceIds();
    } else {
        github.showNames.showIdsAgain();
    }
};
main();
browser.runtime.onConnect.addListener(() => {
    main();
});
