import {
    NarvikServer,
    Node,
    HTMLComponent,
    StyledHTMLComponent,
    JavascriptComponent,
    StyledJavascriptComponent,
    Store,
    ServeContext
} from './Narvik';
import * as vm from 'vm';
import { readFileSync } from 'fs';
import { resolve as resolvePath } from 'path'

const appDir = 'example-app'
const server = new NarvikServer(appDir)
server.start()


const context = vm.createContext({
    Node,
    HTMLComponent,
    StyledHTMLComponent,
    JavascriptComponent,
    StyledJavascriptComponent,
    Store
})

server.setRequestHandler((req, res) => new Promise((resolve, reject) => {
    context.req = req
    context.res = res
    const script = new vm.Script(readFileSync(resolvePath(appDir, 'main.js')).toString())
    script.runInContext(context)
    resolve(({ rootNode: context.rootNode, store: context.store }) as ServeContext)
}))