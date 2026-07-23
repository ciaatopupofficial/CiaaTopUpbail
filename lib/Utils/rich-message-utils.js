"use strict"


Object.defineProperty(exports, "__esModule", { value: true })
exports.prepareRichResponseMessage = exports.tokenizeCode = void 0

const crypto_1 = require("crypto")
const WAProto_1 = require("../../WAProto")

// ─── Enums (sesuai AIRichResponseCodeHighlightType di WAProto) ────────────────

const CodeHighlightType = {
    DEFAULT: 0,
    KEYWORD: 1,
    METHOD: 2,
    STRING: 3,
    NUMBER: 4,
    COMMENT: 5,
}

const RichSubMessageType = {
    UNKNOWN: 0, TEXT: 2, CODE: 5, TABLE: 4, CONTENT_ITEMS: 9
}

// ─── Keyword Sets ─────────────────────────────────────────────────────────────

const JS_KEYWORDS = new Set([
    'import','export','from','default','as','const','let','var','function','class','extends','new',
    'return','if','else','for','while','do','switch','case','break','continue',
    'try','catch','finally','throw','async','await','yield',
    'typeof','instanceof','in','of','delete','void',
    'true','false','null','undefined','NaN','Infinity',
    'this','super','static','get','set','debugger','with'
])
const PYTHON_KEYWORDS = new Set([
    'import','from','as','def','class','return','if','elif','else',
    'for','while','break','continue','try','except','finally','raise',
    'with','yield','lambda','pass','del','global','nonlocal','assert',
    'True','False','None','and','or','not','in','is','async','await','self','print'
])
const BASH_KEYWORDS = new Set([
    'if','then','else','elif','fi','case','esac','for','while',
    'until','do','done','in','function','select','time','coproc',
    'echo','printf','read','cd','pwd','exit','export','unset',
    'alias','unalias','source','exec','eval','test','shift',
    'trap','wait','jobs','kill','bg','fg','history','type',
    'ulimit','umask','set','true','false'
])
const GO_KEYWORDS = new Set([
    'break','default','func','interface','select','case','defer','go','map','struct',
    'chan','else','goto','package','switch','const','fallthrough','if','range','type',
    'continue','for','import','return','var','true','false','nil'
])
const CPP_KEYWORDS = new Set([
    'alignas','alignof','and','asm','auto','bool','break','case','catch','char','class',
    'const','constexpr','continue','decltype','default','delete','do','double','else',
    'enum','explicit','export','extern','false','float','for','friend','goto','if',
    'inline','int','long','mutable','namespace','new','noexcept','nullptr','operator',
    'private','protected','public','return','short','signed','sizeof','static','struct',
    'switch','template','this','throw','true','try','typedef','typename','union',
    'unsigned','using','virtual','void','volatile','while'
])
const RUST_KEYWORDS = new Set([
    'as','break','const','continue','crate','else','enum','extern','false','fn',
    'for','if','impl','in','let','loop','match','mod','move','mut','pub','ref',
    'return','self','Self','static','struct','super','trait','true','type','unsafe',
    'use','where','while','async','await','dyn','try'
])
const C_KEYWORDS = new Set([
    'auto','break','case','char','const','continue','default','do','double','else',
    'enum','extern','float','for','goto','if','inline','int','long','register',
    'restrict','return','short','signed','sizeof','static','struct','switch',
    'typedef','union','unsigned','void','volatile','while'
])
const CSHARP_KEYWORDS = new Set([
    'abstract','as','base','bool','break','byte','case','catch','char','checked',
    'class','const','continue','decimal','default','delegate','do','double','else',
    'enum','event','explicit','extern','false','finally','fixed','float','for',
    'foreach','goto','if','implicit','in','int','interface','internal','is','lock',
    'long','namespace','new','null','object','operator','out','override','params',
    'private','protected','public','readonly','ref','return','sbyte','sealed','short',
    'sizeof','static','string','struct','switch','this','throw','true','try','typeof',
    'uint','ulong','unchecked','unsafe','ushort','using','virtual','void','volatile',
    'while','async','await','var','yield'
])
const CSS_KEYWORDS = new Set([
    'import','media','font-face','keyframes','supports','charset',
    'important','root','hover','active','focus','visited','before','after',
    'not','nth-child','first-child','last-child','none','inherit','initial','auto'
])
const HTML_KEYWORDS = new Set([
    'html','head','body','title','meta','link','script','style',
    'header','footer','main','section','article','div','span',
    'h1','h2','h3','h4','h5','h6','p','a','img','ul','ol','li',
    'table','tr','td','th','thead','tbody','form','input','button','select',
    'textarea','label','option','canvas','svg','iframe','video','audio'
])
const CMD_KEYWORDS = new Set([
    'echo','set','if','else','for','in','do','goto','call','exit','shift',
    'pause','start','cls','rem','dir','copy','move','del','mkdir','rmdir',
    'type','ren','ping','ipconfig','netstat','shutdown'
])
const POWERSHELL_KEYWORDS = new Set([
    'function','filter','param','begin','process','end','if','else','elseif',
    'switch','foreach','for','while','do','break','continue','return',
    'throw','try','catch','finally','$true','$false','$null',
    'Write-Host','Write-Output','Get-ChildItem','Test-Path','Invoke-Command'
])

const LANGUAGE_KEYWORDS = {
    css: CSS_KEYWORDS, html: HTML_KEYWORDS,
    javascript: JS_KEYWORDS, typescript: JS_KEYWORDS, js: JS_KEYWORDS, ts: JS_KEYWORDS,
    python: PYTHON_KEYWORDS, py: PYTHON_KEYWORDS,
    go: GO_KEYWORDS, golang: GO_KEYWORDS,
    cpp: CPP_KEYWORDS, 'c++': CPP_KEYWORDS,
    rust: RUST_KEYWORDS, rs: RUST_KEYWORDS,
    c: C_KEYWORDS, h: C_KEYWORDS,
    csharp: CSHARP_KEYWORDS, cs: CSHARP_KEYWORDS,
    bash: BASH_KEYWORDS, sh: BASH_KEYWORDS, zsh: BASH_KEYWORDS,
    cmd: CMD_KEYWORDS, bat: CMD_KEYWORDS,
    powershell: POWERSHELL_KEYWORDS, ps1: POWERSHELL_KEYWORDS
}

const LEXER_REGEX = /(\/\/.*|\/\*[\s\S]*?\*\/|#.*)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`[\s\S]*?`)|(\b[a-zA-Z_]\w*\b)(?=\s*\()|(\b[a-zA-Z_]\w*\b)|(\b\d+(?:\.\d+)?\b)|(\s+|[^\w\s]+)/g

const NOOP = new Set([])

// ─── tokenizeCode ─────────────────────────────────────────────────────────────

const tokenizeCode = (code, language = 'javascript') => {
    const keywords = LANGUAGE_KEYWORDS[language] || NOOP
    const blocks = []
    LEXER_REGEX.lastIndex = 0
    let match
    while ((match = LEXER_REGEX.exec(code)) !== null) {
        if (match[1]) {
            blocks.push({ highlightType: CodeHighlightType.COMMENT, codeContent: match[1] })
        } else if (match[2]) {
            blocks.push({ highlightType: CodeHighlightType.STRING, codeContent: match[2] })
        } else if (match[3]) {
            blocks.push({
                highlightType: keywords.has(match[3]) ? CodeHighlightType.KEYWORD : CodeHighlightType.METHOD,
                codeContent: match[3],
            })
        } else if (match[4]) {
            blocks.push({
                highlightType: keywords.has(match[4]) ? CodeHighlightType.KEYWORD : CodeHighlightType.DEFAULT,
                codeContent: match[4],
            })
        } else if (match[5]) {
            blocks.push({ highlightType: CodeHighlightType.NUMBER, codeContent: match[5] })
        } else {
            blocks.push({ highlightType: CodeHighlightType.DEFAULT, codeContent: match[6] })
        }
    }
    return blocks
}
exports.tokenizeCode = tokenizeCode

// ─── toUnified ────────────────────────────────────────────────────────────────

const toUnified = (submessages, uuid) => ({
    response_id: uuid,
    sections: submessages.map((submessage) => {
        if (submessage.messageType === RichSubMessageType.CODE) {
            const cm = submessage.codeMetadata
            return {
                view_model: {
                    primitive: {
                        language: cm.codeLanguage,
                        code_blocks: cm.codeBlocks.map((block) => ({
                            content: block.codeContent,
                            type: Object.keys(CodeHighlightType).find(k => CodeHighlightType[k] === block.highlightType) || 'DEFAULT'
                        })),
                        __typename: 'GenAICodeUXPrimitive'
                    },
                    __typename: 'GenAISingleLayoutViewModel'
                }
            }
        }
        if (submessage.messageType === RichSubMessageType.TEXT) {
            return {
                view_model: {
                    primitive: {
                        text: submessage.messageText,
                        inline_entities: [],
                        __typename: 'GenAIMarkdownTextUXPrimitive'
                    },
                    __typename: 'GenAISingleLayoutViewModel'
                }
            }
        }
        return {}
    })
})

// ─── botMetadataSignature / botMetadataCertificate ───────────────────────────

const botMetadataSignature = () => {
    const sig = new Uint8Array(64)
    crypto_1.getRandomValues(sig)
    return sig
}

const botMetadataCertificate = (length = 685) => {
    const cert = new Uint8Array(length)
    cert[0] = 48
    cert[1] = 130
    crypto_1.getRandomValues(cert.subarray(2))
    return cert
}

// ─── prepareRichResponseMessage ───────────────────────────────────────────────

const prepareRichResponseMessage = (content) => {
    const proto = WAProto_1.proto
    let submessagesData = []

    // ── Mode 1: richResponse array [{text}, {code, language}, ...] ──
    if (Array.isArray(content.richResponse)) {
        for (const item of content.richResponse) {
            if (item.text !== undefined) {
                submessagesData.push({ messageType: RichSubMessageType.TEXT, messageText: item.text })
            } else if (item.code !== undefined) {
                const lang = item.language || 'javascript'
                const codeBlocks = tokenizeCode(item.code, lang)
                submessagesData.push({
                    messageType: RichSubMessageType.CODE,
                    codeMetadata: { codeLanguage: lang, codeBlocks }
                })
            }
        }
    }
    // ── Mode 2: single code block { code, language } ──
    else {
        const lang = content.language || 'javascript'
        const codeBlocks = tokenizeCode(content.code, lang)
        submessagesData.push({
            messageType: RichSubMessageType.CODE,
            codeMetadata: { codeLanguage: lang, codeBlocks }
        })
    }

    // Build proto submessages
    const submessages = submessagesData.map(s => {
        if (s.messageType === RichSubMessageType.TEXT) {
            return proto.AIRichResponseSubMessage.create({
                messageType: RichSubMessageType.TEXT,
                messageText: s.messageText
            })
        } else {
            return proto.AIRichResponseSubMessage.create({
                messageType: RichSubMessageType.CODE,
                codeMetadata: proto.AIRichResponseCodeMetadata.create({
                    codeLanguage: s.codeMetadata.codeLanguage,
                    codeBlocks: s.codeMetadata.codeBlocks.map(b =>
                        proto.AIRichResponseCodeMetadata.AIRichResponseCodeBlock.create({
                            highlightType: b.highlightType,
                            codeContent: b.codeContent
                        })
                    )
                })
            })
        }
    })

    const uuid = crypto_1.randomUUID()
    const unified = toUnified(submessagesData, uuid)

    const richResponseMessage = proto.AIRichResponseMessage.create({
        submessages,
        messageType: 1, // AI_RICH_RESPONSE_TYPE_STANDARD
        unifiedResponse: proto.AIRichResponseUnifiedResponse
            ? proto.AIRichResponseUnifiedResponse.create({
                data: Buffer.from(JSON.stringify(unified))
            })
            : { data: Buffer.from(JSON.stringify(unified)) },
        contextInfo: {
            isForwarded: true,
            forwardingScore: 1,
            forwardedAiBotMessageInfo: { botJid: '867051314767696@bot' },
            forwardOrigin: 4
        }
    })

    const message = {
        messageContextInfo: {
            botMetadata: {
                verificationMetadata: {
                    proofs: [{
                        certificateChain: [botMetadataCertificate(), botMetadataCertificate(892)],
                        version: 1,
                        useCase: 1,
                        signature: botMetadataSignature()
                    }]
                },
                botResponseId: uuid
            }
        },
        botForwardedMessage: {
            message: { richResponseMessage }
        }
    }

    return message
}
exports.prepareRichResponseMessage = prepareRichResponseMessage
