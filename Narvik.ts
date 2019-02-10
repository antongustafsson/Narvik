import * as express from 'express';
import { resolve as resolvePath } from 'path';
import { readFileSync, existsSync } from 'fs';
import { v4 as uuid } from 'uuid';
import * as mime from 'mime';

let componentsDirectory = resolvePath(__dirname, 'components')
const htmlFileFilename = 'index.html'
const componentEntrypointFilename = 'index.js'
const componentStylesheetFilename = 'styles.css'
const templateRegexp = /<\s*([\w\.]*?)\s*\/>/g

const extractStoreUsage = (code: string): string[] => {
    const result = /\/\/\s*using\s*\(([\w\d\s,]+)\)/g.exec(code)
    if (result) {
        return result[1].split(',').map(untrimmed => untrimmed.trim())
    }
    return []
}

const getAllMatches = (regexp: RegExp, subject: string) => {
    const matches = []
    let match
    do {
        match = regexp.exec(subject)
        if (match) {
            matches.push(match[1])
        }
    } while (match)
    return matches
}

const replaceAll = (regexp: RegExp, subject: string, replacer: (match: string) => string) => {
    let match
    do {
        match = regexp.exec(subject)
        if (match) {
            subject = subject.replace(match[0], replacer(match[1]))
        }
    } while (match)
    return subject
}

class ContentServer {
    data = {}

    private generateName(type: string) {
        return `${uuid()}.${type}`
    }

    store(bundle: string, type: string) {
        const key = this.generateName(type)
        this.data[key] = bundle
        setTimeout(() => {
            delete this.data[key]
        }, 5000);
        return key
    }

    serve(key: string): string {
        const copy = this.data[key] && this.data[key].toString()
        delete this.data[key]
        return copy
    }
}

export interface ServeContext {
    rootNode: Node
    store: Store
}

export class NarvikServer {
    contentServer: ContentServer = new ContentServer()
    requestHandler: (req, res) => Promise<ServeContext>
    appPath: string
    private app

    constructor(appPath: string) {
        this.appPath = appPath
        componentsDirectory = resolvePath(this.appPath, 'components')
        this.app = express()
        this.app.use((req, res) => {
            if (req.path === '/') {
                if (this.requestHandler) {
                    this.requestHandler(req, res).then(context => {
                        console.log('Render:', (context.rootNode.presentable || context.rootNode).toString())
                        const result = this.compile(context.rootNode, context.store)
                        res.send(result)
                    })
                } else {
                    res.status(404)
                    res.send('Not found')
                }
            } else {
                const filename = req.path.substring(1)
                const content = this.contentServer.serve(filename)
                if (content) {
                    res.set('Content-Type', mime.getType(filename.split('.')[1]))
                    res.send(content)
                } else {
                    res.status(404)
                    res.send('Not found')
                }
            }
        })
    }

    setRequestHandler(handler: (req, res) => Promise<ServeContext>) {
        this.requestHandler = handler
    }

    start() {
        this.app.listen(8080)
    }

    compile(node: Node, store: Store) {
        const renderResult = node.render()
        const componentNames = Object.keys(renderResult.javascript)
        const storeObject = {}
        node.usage.forEach(key => {
            storeObject[key] = store.getValue(key)
        })

        let javascriptBundle = null
        if (componentNames.length > 0) {
            const componentsDefenition = componentNames.map(name => {
                return `window.components["${name}"] = eval(atob("${Buffer.from(renderResult.javascript[name]).toString('base64')}"))`
            }).join(';\n')
            const storeDefinition = `const store = ${JSON.stringify(storeObject)}`
            javascriptBundle = readFileSync('bundlefile.js')
                .toString()
                .replace(`"define components";`, componentsDefenition)
                .replace(`"define store";`, storeDefinition)
        }

        return replaceAll(/#\[place ([\sa-z]+)\]/g, renderResult.html, name => {
            if (name === 'scripts' && componentNames.length > 0) {
                return `<script src="/${this.contentServer.store(javascriptBundle, 'js')}"></script>`
            } else if (name === 'styles' && renderResult.css.length > 0) {
                return `<link rel="stylesheet" type="text/css" href="/${this.contentServer.store(renderResult.css, 'css')}"`
            }
            return ''
        })
    }
}

export class Store {
    state: object
    constructor() {
        this.state = {}
    }

    getValue(key: string) {
        return this.state[key]
    }

    set(value: object) {
        this.state = value
    }

    setValue(key: string, value: any) {
        this.state[key] = value
    }
}

interface Component {
    name: string
    usage?: string[]
    bundlePath: string
}

interface ICSSComponent extends Component {
    stylesheet: string
}

const loadResource = (bundleIdentifier: string, resourceName: string): { bundlePath: string, content: string } | null => {
    const bundlePath = resolvePath(componentsDirectory, bundleIdentifier)
    const expectedContentFilepath = resolvePath(bundlePath, resourceName)
    console.log('Load resource', expectedContentFilepath)
    if (existsSync(expectedContentFilepath)) {
        return {
            bundlePath,
            content: readFileSync(expectedContentFilepath).toString()
        }
    }
    return null
}

export class CSSComponent implements Component, ICSSComponent {
    name: string
    bundlePath: string
    stylesheet: string
}

export class HTMLComponent implements Component {
    name: string
    htmlContent: string
    bundlePath: string

    constructor(bundleIdentifier: string) {
        this.name = bundleIdentifier
        const result = loadResource(this.name, htmlFileFilename)
        if (result) {
            this.htmlContent = result.content
            this.bundlePath = result.bundlePath
        }
    }
}

export class StyledHTMLComponent extends HTMLComponent implements CSSComponent {
    name: string
    htmlContent: string
    bundlePath: string
    stylesheet: string

    constructor(bundleIdentifier: string) {
        super(bundleIdentifier)
        const result = loadResource(bundleIdentifier, componentStylesheetFilename)
        if (result) {
            this.bundlePath = result.bundlePath
            this.stylesheet = result.content
        }
    }
}

export class JavascriptComponent implements Component {
    name: string
    usage?: string[]
    code: string
    bundlePath: string

    constructor(bundleIdentifier: string) {
        this.name = bundleIdentifier
        const result = loadResource(bundleIdentifier, componentEntrypointFilename)
        if (result) {
            this.bundlePath = result.bundlePath
            this.code = result.content
        } else throw new Error(`Component entrypoint not found: ${bundleIdentifier}`)
        this.usage = extractStoreUsage(this.code)
    }
}

export class StyledJavascriptComponent extends JavascriptComponent implements CSSComponent {
    name: string
    usage?: string[]
    code: string
    bundlePath: string
    stylesheet: string

    constructor(bundleIdentifier: string) {
        super(bundleIdentifier)
        const result = loadResource(bundleIdentifier, componentStylesheetFilename)
        if (result) {
            this.bundlePath = result.bundlePath
            this.stylesheet = result.content
        }
    }
}

interface NodeRenderResult {
    html: string
    css: string
    javascript: object
    renderedComponents: string[]
}

export class Node {
    name: string
    parentNode?: Node
    childNodes: Array<Node> = []
    usage?: string[] = []
    component?: Component | JavascriptComponent | StyledJavascriptComponent | HTMLComponent
    template?: string
    presentable?: Node

    constructor(name: string, usage?: string[], component?: Component, template?: string) {
        this.name = name
        this.childNodes = []
        this.usage = usage
        this.template = template

        if (component) {
            this.component = component
            this.usage = component.usage
        }
    }

    addChild(node: Node) {
        node.parentNode = this
        this.childNodes.push(node)
    }

    hasParent(): boolean {
        return Boolean(this.parentNode)
    }

    private getChildNodeByName(name: string): Node | null {
        const filterResult = this.childNodes.filter(node => node.name === name)
        if (filterResult.length > 0) {
            return filterResult[0]
        }
        return null
    }

    render(): NodeRenderResult {
        let renderResult: NodeRenderResult = {
            html: '',
            css: '',
            javascript: {},
            renderedComponents: []
        }

        if (this.presentable) {
            return this.presentable.render()
        } else {

            if (this.component instanceof JavascriptComponent) {
                renderResult.javascript[this.name] = this.component.code
                renderResult.html = `<div class="instance--${this.name}"></div>`
            }

            if (this.component instanceof StyledJavascriptComponent) {
                renderResult.css = this.component.stylesheet
            }

            if (this.component instanceof HTMLComponent) {
                this.template = this.component.htmlContent
            }

            if (this.component instanceof StyledHTMLComponent) {
                renderResult.css = this.component.stylesheet
            }

            if (this.template) {
                renderResult.html = replaceAll(templateRegexp, this.template, match => {
                    if (match === this.name) throw new Error('Node cannot render itself')
                    const childNode = this.getChildNodeByName(match)
                    if (childNode) {
                        const childRenderResult = childNode.render()
                        if (renderResult.renderedComponents.indexOf(childNode.name) < 0) {
                            renderResult.javascript = Object.assign({}, renderResult.javascript, childRenderResult.javascript)
                            renderResult.css += `\n${childRenderResult.css}`
                        }
                        renderResult.renderedComponents.push(childNode.name)
                        return childRenderResult.html
                    }
                    return ''
                    // throw new Error(`Node "${match}" does not exist`)
                })
            }
        }
        return renderResult
    }

    present(node: Node) {
        this.presentable = node
    }

    toString() {
        let buffer = ''
        buffer += `Node(${this.name})`
        if (this.usage && this.usage.length > 0) {
            buffer += ': ' + this.usage.join(', ')
        }
        if (this.childNodes.length > 0) {
            buffer += `{\n`
            for (let i = 0; i < this.childNodes.length; i++) {
                const node = this.childNodes[i]
                buffer += `  ${node.toString()}\n`
            }
            buffer += `}`
        }
        return buffer
    }

    static fromComponent(component: Component, usage?: string[]): Node {
        if (component && component.name) {
            return new Node(component.name, usage || component.usage, component)
        } else throw new Error(`Value ${component} is not a valid component`)
    }

    static fromTemplate(name: string, template: string, usage: string[] = []): Node {
        return new Node(name, usage, undefined, template)
    }
}