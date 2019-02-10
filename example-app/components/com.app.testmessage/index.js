// using (appName, message, useragent)
function component(htmlElement, store) {
    const { appName, message, useragent } = store
    htmlElement.innerHTML = `${appName} says "${message}", and your user agent is "${useragent}"`
}

component