this.requests = (this.requests + 1) || 0

function createPage() {
    const rootNode = new Node('root', ['appName', 'time', 'message', 'useragent', 'requests'])
    const htmlNode = Node.fromComponent(new StyledHTMLComponent('page'))
    rootNode.present(htmlNode)

    const topBar = Node.fromComponent(new StyledHTMLComponent('com.app.topbar'))
    htmlNode.addChild(topBar)

    const testMessage = Node.fromComponent(new JavascriptComponent('com.app.testmessage'))
    htmlNode.addChild(testMessage)

    const timeReport = Node.fromComponent(new StyledJavascriptComponent('com.app.timereport'))
    htmlNode.addChild(timeReport)

    const topBarLogo = Node.fromComponent(new StyledHTMLComponent('com.app.topbarlogo'))
    htmlNode.addChild(topBarLogo)

    const requestCounter = Node.fromComponent(new JavascriptComponent('com.app.requestcounter'))
    htmlNode.addChild(requestCounter)

    store = new Store()
    store.setValue('appName', 'Narvik App')
    store.setValue('time', new Date())
    store.setValue('message', 'Hello world!')
    store.setValue('useragent', req.get('User-Agent'))
    store.setValue('requests', this.requests)

    this.rootNode = rootNode
    this.store = store
}

createPage()