import css, { type CssAtRuleAST } from '@adobe/css-tools'
import cssSelectorParser from 'postcss-selector-parser'

/**
 * Applies PocketRisu's CSS isolation rules: message-owned classes receive the
 * x-risu- prefix and every selector is constrained below .chattext.
 */
export function transformRisuCss(source: string, rootScope = ''): string | undefined {
    if (/(?:expression\s*\(|javascript:|-moz-binding)/i.test(source)) return undefined
    try {
        const ast = css.parse(source)
        const rules = ast.stylesheet?.rules
        if (rules) {
            for (let index = 0; index < rules.length; index += 1) {
                rules[index] = transformRisuCssRule(rules[index], rootScope)
            }
            ast.stylesheet.rules = rules
        }
        return css.stringify(ast, { indent: '', compress: true })
    } catch {
        return undefined
    }
}

function transformRisuCssRule(rule: CssAtRuleAST, rootScope: string): CssAtRuleAST {
    if (rule.type === 'rule' && rule.selectors) {
        const chatScope = rootScope ? `${rootScope} .chattext` : '.chattext'
        for (let index = 0; index < rule.selectors.length; index += 1) {
            const selector = rule.selectors[index]
            if (!selector) continue
            const parser = cssSelectorParser((root) => {
                root.walkClasses((className) => {
                    if (!className.value.startsWith('x-risu-')) {
                        className.value = `x-risu-${className.value}`
                    }
                })
            })
            const transformed = parser.processSync(selector)
            rule.selectors[index] =
                transformed.trim() === ':root' ? chatScope : `${chatScope} ${transformed}`
        }
    }
    if (
        ['media', 'supports', 'document', 'host', 'container'].includes(rule.type) &&
        'rules' in rule &&
        rule.rules
    ) {
        for (let index = 0; index < rule.rules.length; index += 1) {
            rule.rules[index] = transformRisuCssRule(rule.rules[index], rootScope)
        }
    }
    if (rule.type === 'import' && /(?:^|url\(\s*["']?)data:/i.test(rule.import)) {
        rule.import = 'url("data:,")'
    }
    return rule
}
