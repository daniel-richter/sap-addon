const artifactoryEngSrvAccounts = {
    login: {
        optionName: "artifactory-login",
        configNameUserId: "config-user-id",
        configNameEmailAddress: "config-email",
        urlHostPaths: [
            "eng-srv.accounts.ondemand.com/saml2/idp/sso/eng-srv.accounts.ondemand.com",
            "eng-srv.accounts400.ondemand.com/oauth2/authorize",
        ],
        queryUserIdInput: "input#j_username[placeholder='User ID']",
        queryBtnContinue: "button#logOnFormSubmit",
    },
};

function executeLogin() {
    executeFunctionAfterPageLoaded(function () {
        fillUserIdAndLogIn();
    });
}
function fillUserIdAndLogIn() {
    const configUserId = config[artifactoryEngSrvAccounts.login.configNameUserId];
    const configEmail = config[artifactoryEngSrvAccounts.login.configNameEmailAddress];

    const userId = configUserId || configEmail;
    if (userId) {
        const userIdInput = document.querySelector(artifactoryEngSrvAccounts.login.queryUserIdInput);
        if (userIdInput) {
            userIdInput.value = userId;

            const btnContinue = document.querySelector(artifactoryEngSrvAccounts.login.queryBtnContinue);
            if (btnContinue && btnContinue.click) {
                btnContinue.click();
                return;
            } else {
                console.debug("Auto Login Failed: Didn't find button to log in");
            }
        } else {
            console.debug("Auto Login Failed: Didn't find User ID input");
        }
    } else {
        console.debug("Couldn't perform auto login: No User ID (or email address) configured in SAP Addon");
    }
}

let options = {};
let config = {};

async function main() {
    const urlHostPath = url.host + url.pathname;
    if (artifactoryEngSrvAccounts.login.urlHostPaths.includes(urlHostPath)) {
        [options, config] = await Promise.all([loadFromStorage("options"), loadFromStorage("config")]);

        if (isEnabled(artifactoryEngSrvAccounts.login.optionName)) {
            executeLogin();
        }
    }
}
main();
browser.runtime.onConnect.addListener(() => {
    main();
});
