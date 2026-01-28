/* ═══════════════════════════════════════════════════════════════
   bloom UI — Enhanced with Gateway Features
   ═══════════════════════════════════════════════════════════════ */

// State
const state = {
  currentView: 'chat',
  workers: [],
  selectedWorker: null,
  libraryPath: '',
  ws: null,
  wsConnected: false,
  wsToken: null,
  rpcId: 1,
  rpcCallbacks: new Map(),
  eventLog: [],
  logs: [],
  logsSubscribed: false,
  sessions: [],
  channels: [],
  crons: [],
  skills: [],
  nodes: [],
  config: null,
  status: null,
  health: null,
  models: [],
  // Chat state
  chatMessages: [],
  chatSessionKey: null,
  isTyping: false,
  currentStreamingMessage: null
}

// Gateway configuration
const GATEWAY_URL = 'ws://127.0.0.1:18789'

// ═══════════════════════════════════════════════════════════════
// WebSocket / Gateway Connection
// ═══════════════════════════════════════════════════════════════

function initGateway() {
  if (state.ws && state.ws.readyState === WebSocket.OPEN) {
    return
  }
  
  const token = state.wsToken || localStorage.getItem('bloom-gateway-token') || ''
  const url = token ? `${GATEWAY_URL}?token=${encodeURIComponent(token)}` : GATEWAY_URL
  
  try {
    state.ws = new WebSocket(url)
    
    state.ws.onopen = () => {
      console.log('🌸 WebSocket open, sending handshake...')
      
      // Send connect handshake - Gateway requires specific protocol format
      const handshake = {
        type: "req",
        id: "handshake-" + Date.now(),
        method: "connect",
        params: {
          minProtocol: 1,
          maxProtocol: 1,
          client: {
            id: "control-ui",
            version: "1.0.0",
            platform: "web",
            mode: "interactive"
          },
          auth: { token: state.wsToken || localStorage.getItem('bloom-gateway-token') || '' }
        }
      }
      state.ws.send(JSON.stringify(handshake))
    }
    
    state.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        handleGatewayMessage(data)
      } catch (err) {
        console.error('Failed to parse gateway message:', err)
      }
    }
    
    state.ws.onerror = (err) => {
      console.log('Gateway connection error')
      state.wsConnected = false
      updateConnectionStatus(false)
    }
    
    state.ws.onclose = () => {
      console.log('Gateway disconnected')
      state.wsConnected = false
      updateConnectionStatus(false)
      
      // Attempt reconnect after delay
      setTimeout(initGateway, 5000)
    }
  } catch (err) {
    console.log('WebSocket not available:', err)
    updateConnectionStatus(false)
  }
}

function updateConnectionStatus(connected) {
  const indicator = document.getElementById('connection-status')
  if (indicator) {
    indicator.className = `connection-status ${connected ? 'connected' : 'disconnected'}`
    indicator.title = connected ? 'Connected to Gateway' : 'Disconnected from Gateway'
  }
  
  // Update chat input state
  const chatInput = document.getElementById('chat-input')
  const chatSend = document.getElementById('chat-send')
  if (chatInput && chatSend) {
    if (!connected) {
      chatInput.placeholder = 'Connecting to gateway...'
      chatSend.disabled = true
    } else {
      chatInput.placeholder = 'Type a message...'
      chatSend.disabled = false
    }
  }
}

// Gateway RPC call helper (uses req frame format)
function rpcCall(method, params = {}) {
  return new Promise((resolve, reject) => {
    if (!state.ws || state.ws.readyState !== WebSocket.OPEN || !state.wsConnected) {
      reject(new Error('Not connected to Gateway'))
      return
    }
    
    const id = String(state.rpcId++)
    const message = {
      type: 'req',
      id,
      method,
      params
    }
    
    state.rpcCallbacks.set(id, { resolve, reject })
    
    // Timeout after 30 seconds
    setTimeout(() => {
      if (state.rpcCallbacks.has(id)) {
        state.rpcCallbacks.delete(id)
        reject(new Error('Request timeout'))
      }
    }, 30000)
    
    state.ws.send(JSON.stringify(message))
  })
}

function handleGatewayMessage(data) {
  // Log events for debug view
  if (data.method || data.event) {
    addEventLog(data)
  }
  
  // Handle handshake response - Gateway sends hello-ok on success
  if (data.type === "hello-ok") {
    console.log('🌸 Connected to Gateway (protocol v' + data.protocol + ')')
    state.wsConnected = true
    state.serverInfo = data.server
    updateConnectionStatus(true)
    
    // NOW load initial data after successful handshake
    loadOverviewData()
    subscribeToLogs()
    return
  }
  
  // Handle handshake error
  if (data.type === "error" && !state.wsConnected) {
    console.error('🌸 Handshake failed:', data.error)
    state.wsConnected = false
    updateConnectionStatus(false)
    return
  }
  
  // Handle RPC responses (type: "res" or "error" with matching id)
  if (data.id && state.rpcCallbacks.has(String(data.id))) {
    const callback = state.rpcCallbacks.get(String(data.id))
    const { resolve, reject, isChat, streamingContent } = callback
    state.rpcCallbacks.delete(String(data.id))
    
    if (data.type === 'error' || data.error) {
      const errMsg = data.error?.message || data.message || 'RPC error'
      hideTypingIndicator()
      finalizeStreamingMessage()
      reject(new Error(errMsg))
    } else {
      // For chat messages, check if there's content in the response
      if (isChat) {
        const content = data.result?.content || data.result?.message || data.result?.text
        if (content) {
          resolve({ content })
        } else if (streamingContent) {
          // Streaming was handled separately
          resolve({ content: streamingContent })
        } else {
          // No content, streaming should have handled it
          resolve({})
        }
        
        // Store session key if provided
        if (data.result?.sessionKey) {
          state.chatSessionKey = data.result.sessionKey
        }
      } else {
        resolve(data.result)
      }
    }
    return
  }
  
  // Handle chat events (gateway sends event: "chat" with state field)
  if (data.type === 'event' && data.event === 'chat') {
    handleChatEvent(data.payload)
    return
  }
  
  // Also handle notifications (some gateways use method instead)
  if (data.method === 'chat' && data.params) {
    handleChatEvent(data.params)
    return
  }
  
  // Handle events/notifications
  if (data.method === 'logs.entry' || data.event === 'logs.entry') {
    const entry = data.params || data.data
    if (entry) {
      addLogEntry(entry)
    }
  }
  
  if (data.method === 'system-presence' || data.event === 'system-presence') {
    loadInstances()
  }
}

function addEventLog(event) {
  state.eventLog.unshift({
    time: new Date().toISOString(),
    data: event
  })
  
  // Keep last 100 events
  if (state.eventLog.length > 100) {
    state.eventLog = state.eventLog.slice(0, 100)
  }
  
  // Update UI if on debug tab
  updateEventLogUI()
}

// ═══════════════════════════════════════════════════════════════
// Chat
// ═══════════════════════════════════════════════════════════════

function initChat() {
  const input = document.getElementById('chat-input')
  const sendBtn = document.getElementById('chat-send')
  
  if (!input || !sendBtn) return
  
  // Configure marked for safe rendering
  if (typeof marked !== 'undefined') {
    marked.setOptions({
      breaks: true,  // Convert \n to <br>
      gfm: true,     // GitHub Flavored Markdown
      sanitize: false // We trust the content from our own agent
    })
  }
  
  // Auto-resize textarea
  input.addEventListener('input', () => {
    input.style.height = 'auto'
    input.style.height = Math.min(input.scrollHeight, 150) + 'px'
  })
  
  // Send on Enter (Shift+Enter for newline)
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendChatMessage()
    }
  })
  
  // Send button click
  sendBtn.addEventListener('click', sendChatMessage)
}

async function sendChatMessage() {
  const input = document.getElementById('chat-input')
  const sendBtn = document.getElementById('chat-send')
  
  const message = input?.value?.trim()
  if (!message || !state.wsConnected) return
  
  // Clear input
  input.value = ''
  input.style.height = 'auto'
  
  // Remove welcome message if present
  const welcome = document.querySelector('.chat-welcome')
  if (welcome) welcome.remove()
  
  // Add user message to UI
  addChatMessage('user', message)
  
  // Disable input while sending
  input.disabled = true
  sendBtn.disabled = true
  
  // Show typing indicator
  showTypingIndicator()
  
  try {
    // Generate a unique request ID for this chat message
    const requestId = `chat-${Date.now()}`
    
    // Send chat message via RPC
    const response = await sendChatRPC(requestId, message)
    
    // Hide typing indicator
    hideTypingIndicator()
    
    // If we got a direct response (non-streaming), display it
    if (response?.content) {
      addChatMessage('assistant', response.content)
    }
  } catch (err) {
    hideTypingIndicator()
    addChatMessage('assistant', `Sorry, something went wrong: ${err.message}`)
  } finally {
    input.disabled = false
    sendBtn.disabled = false
    input.focus()
  }
}

function sendChatRPC(requestId, message) {
  return new Promise((resolve, reject) => {
    if (!state.ws || state.ws.readyState !== WebSocket.OPEN || !state.wsConnected) {
      reject(new Error('Not connected to Gateway'))
      return
    }
    
    const id = String(state.rpcId++)
    const sessionKey = state.chatSessionKey || 'bloom-webchat-' + Date.now()
    const idempotencyKey = `bloom-${Date.now()}-${Math.random().toString(36).slice(2)}`
    
    // Store session key for future messages
    if (!state.chatSessionKey) {
      state.chatSessionKey = sessionKey
    }
    
    // Store callback for response
    state.rpcCallbacks.set(id, { 
      resolve, 
      reject,
      isChat: true,
      streamingContent: ''
    })
    
    // Send chat.send request (matches clawdbot protocol)
    const rpcMessage = {
      type: 'req',
      id,
      method: 'chat.send',
      params: {
        message,
        sessionKey,
        idempotencyKey,
        deliver: true
      }
    }
    
    state.ws.send(JSON.stringify(rpcMessage))
    
    // Timeout after 5 minutes for long responses
    setTimeout(() => {
      if (state.rpcCallbacks.has(id)) {
        const cb = state.rpcCallbacks.get(id)
        state.rpcCallbacks.delete(id)
        
        // If we have streaming content, resolve with that
        if (cb.streamingContent) {
          resolve({ content: cb.streamingContent })
        } else {
          reject(new Error('Request timeout'))
        }
      }
    }, 300000)
  })
}

function handleChatEvent(payload) {
  // Handle gateway chat events
  if (!payload) return
  
  const state_ = payload.state
  const message = payload.message
  
  // Handle streaming deltas
  if (state_ === 'delta' && message) {
    // Extract text from message (could be string or object with content)
    const text = typeof message === 'string' 
      ? message 
      : (message.content || message.text || message.delta || '')
    
    if (text) {
      // Update or create streaming message
      if (!state.currentStreamingMessage) {
        hideTypingIndicator()
        state.currentStreamingMessage = addChatMessage('assistant', text, true)
      } else {
        appendToStreamingMessage(text)
      }
    }
  }
  
  // Handle final message
  if (state_ === 'final') {
    if (message && !state.currentStreamingMessage) {
      // Got final without any deltas
      const text = typeof message === 'string' 
        ? message 
        : (message.content || message.text || '')
      hideTypingIndicator()
      if (text) addChatMessage('assistant', text)
    }
    finalizeStreamingMessage()
    hideTypingIndicator()
  }
  
  // Handle errors
  if (state_ === 'error' || state_ === 'aborted') {
    finalizeStreamingMessage()
    hideTypingIndicator()
    
    const errMsg = payload.errorMessage || payload.error || 'Something went wrong'
    if (!state.currentStreamingMessage) {
      addChatMessage('assistant', `⚠️ ${errMsg}`)
    }
  }
}

function addChatMessage(role, content, isStreaming = false) {
  const messagesEl = document.getElementById('chat-messages')
  if (!messagesEl) return null
  
  const messageEl = document.createElement('div')
  messageEl.className = `chat-message ${role}`
  if (isStreaming) messageEl.dataset.streaming = 'true'
  
  const bubbleEl = document.createElement('div')
  bubbleEl.className = 'message-bubble'
  
  // Render markdown for assistant messages
  if (role === 'assistant' && typeof marked !== 'undefined') {
    bubbleEl.innerHTML = marked.parse(content)
  } else {
    bubbleEl.textContent = content
  }
  
  const timeEl = document.createElement('div')
  timeEl.className = 'message-time'
  timeEl.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  
  messageEl.appendChild(bubbleEl)
  messageEl.appendChild(timeEl)
  messagesEl.appendChild(messageEl)
  
  // Store in state
  state.chatMessages.push({ role, content, timestamp: Date.now() })
  
  // Auto-scroll to bottom
  scrollChatToBottom()
  
  return messageEl
}

function appendToStreamingMessage(text) {
  if (!state.currentStreamingMessage) return
  
  const bubbleEl = state.currentStreamingMessage.querySelector('.message-bubble')
  if (!bubbleEl) return
  
  // Get current content and append
  const currentContent = bubbleEl.dataset.rawContent || ''
  const newContent = currentContent + text
  bubbleEl.dataset.rawContent = newContent
  
  // Re-render with markdown
  if (typeof marked !== 'undefined') {
    bubbleEl.innerHTML = marked.parse(newContent)
  } else {
    bubbleEl.textContent = newContent
  }
  
  scrollChatToBottom()
}

function finalizeStreamingMessage() {
  if (state.currentStreamingMessage) {
    state.currentStreamingMessage.removeAttribute('data-streaming')
    
    // Update the stored message with final content
    const bubbleEl = state.currentStreamingMessage.querySelector('.message-bubble')
    if (bubbleEl && state.chatMessages.length > 0) {
      const lastMsg = state.chatMessages[state.chatMessages.length - 1]
      if (lastMsg.role === 'assistant') {
        lastMsg.content = bubbleEl.dataset.rawContent || bubbleEl.textContent
      }
    }
  }
  state.currentStreamingMessage = null
}

function showTypingIndicator() {
  const messagesEl = document.getElementById('chat-messages')
  if (!messagesEl || state.isTyping) return
  
  state.isTyping = true
  
  const indicator = document.createElement('div')
  indicator.className = 'typing-indicator'
  indicator.id = 'typing-indicator'
  indicator.innerHTML = `
    <div class="typing-dots">
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
    </div>
    <span class="typing-text">thinking...</span>
  `
  
  messagesEl.appendChild(indicator)
  scrollChatToBottom()
}

function hideTypingIndicator() {
  const indicator = document.getElementById('typing-indicator')
  if (indicator) {
    indicator.remove()
  }
  state.isTyping = false
}

function scrollChatToBottom() {
  const messagesEl = document.getElementById('chat-messages')
  if (messagesEl) {
    messagesEl.scrollTop = messagesEl.scrollHeight
  }
}

// ═══════════════════════════════════════════════════════════════
// Navigation
// ═══════════════════════════════════════════════════════════════

function initNavigation() {
  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault()
      const view = link.dataset.view
      switchView(view)
    })
  })
  
  document.getElementById('back-to-household')?.addEventListener('click', () => {
    switchView('household')
  })
  
  // Settings tabs
  document.querySelectorAll('.settings-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'))
      document.querySelectorAll('.settings-pane').forEach(p => p.classList.remove('active'))
      
      tab.classList.add('active')
      const pane = document.getElementById(`settings-${tab.dataset.tab}`)
      if (pane) pane.classList.add('active')
      
      // Load tab-specific data
      if (tab.dataset.tab === 'config') loadConfig()
      if (tab.dataset.tab === 'logs' && !state.logsSubscribed) subscribeToLogs()
    })
  })
}

function switchView(viewName) {
  // Hide all views
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'))
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'))
  
  // Show requested view
  const view = document.getElementById(`view-${viewName}`)
  if (view) {
    view.classList.add('active')
    state.currentView = viewName
    
    // Update nav
    const navLink = document.querySelector(`[data-view="${viewName}"]`)
    if (navLink) navLink.classList.add('active')
    
    // Load view-specific data
    loadViewData(viewName)
  }
}

function loadViewData(viewName) {
  switch (viewName) {
    case 'chat':
      // Chat is always ready, just focus input
      setTimeout(() => {
        document.getElementById('chat-input')?.focus()
      }, 100)
      break
    case 'overview':
      loadOverviewData()
      break
    case 'conversations':
      loadSessions()
      break
    case 'channels':
      loadChannels()
      break
    case 'household':
      loadWorkers()
      break
    case 'routines':
      loadCrons()
      break
    case 'skills':
      loadSkills()
      break
    case 'friends':
      loadNodes()
      break
    case 'library':
      loadLibrary()
      break
    case 'settings':
      loadConfig()
      break
  }
}

// ═══════════════════════════════════════════════════════════════
// Overview
// ═══════════════════════════════════════════════════════════════

async function loadOverviewData() {
  await Promise.all([
    loadStatus(),
    loadHealth(),
    loadModels(),
    loadInstances(),
    loadQuickStats()
  ])
}

async function loadStatus() {
  try {
    const status = await rpcCall('status')
    state.status = status
    
    const statusEl = document.getElementById('system-status')
    const detailsEl = document.getElementById('status-details')
    
    if (statusEl) {
      statusEl.innerHTML = `
        <span class="status-dot healthy"></span>
        <span class="status-text">System Healthy</span>
      `
    }
    
    if (detailsEl && status) {
      detailsEl.innerHTML = `
        <div class="detail-row">
          <span class="detail-label">Version</span>
          <span class="detail-value">${status.version || 'Unknown'}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Uptime</span>
          <span class="detail-value">${formatUptime(status.uptime)}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Memory</span>
          <span class="detail-value">${formatBytes(status.memory?.heapUsed)}</span>
        </div>
      `
    }
  } catch (err) {
    const statusEl = document.getElementById('system-status')
    if (statusEl) {
      statusEl.innerHTML = `
        <span class="status-dot error"></span>
        <span class="status-text">Disconnected</span>
      `
    }
  }
}

async function loadHealth() {
  try {
    const health = await rpcCall('health')
    state.health = health
  } catch (err) {
    console.log('Failed to load health:', err.message)
  }
}

async function loadModels() {
  try {
    const result = await rpcCall('models.list')
    state.models = result?.models || []
    
    const modelEl = document.getElementById('model-info')
    if (modelEl && state.models.length > 0) {
      const defaultModel = state.models.find(m => m.default) || state.models[0]
      modelEl.innerHTML = `
        <div class="model-primary">
          <span class="model-name">${formatModelName(defaultModel.id)}</span>
          ${defaultModel.default ? '<span class="model-badge">default</span>' : ''}
        </div>
        <div class="model-details dim">
          ${state.models.length} model${state.models.length !== 1 ? 's' : ''} available
        </div>
      `
    }
  } catch (err) {
    console.log('Failed to load models:', err.message)
  }
}

async function loadInstances() {
  try {
    const result = await rpcCall('system-presence')
    const instances = result?.presence || result || []
    
    const listEl = document.getElementById('instances-list')
    if (listEl) {
      if (!instances.length) {
        listEl.innerHTML = '<p class="dim">No instances connected</p>'
      } else {
        listEl.innerHTML = instances.map(inst => `
          <div class="instance-item">
            <span class="instance-icon">${getInstanceIcon(inst.type)}</span>
            <span class="instance-name">${inst.name || inst.id}</span>
            <span class="instance-type dim">${inst.type || 'unknown'}</span>
          </div>
        `).join('')
      }
    }
  } catch (err) {
    console.log('Failed to load instances:', err.message)
  }
}

async function loadQuickStats() {
  try {
    const [sessionsResult, channelsResult, cronsResult] = await Promise.all([
      rpcCall('sessions.list').catch(() => ({ sessions: [] })),
      rpcCall('channels.status').catch(() => ({ channels: [] })),
      rpcCall('cron.list').catch(() => ({ jobs: [] }))
    ])
    
    document.getElementById('stat-sessions').textContent = 
      sessionsResult?.sessions?.length || 0
    document.getElementById('stat-channels').textContent = 
      Object.keys(channelsResult?.channels || channelsResult || {}).length || 0
    document.getElementById('stat-crons').textContent = 
      cronsResult?.jobs?.length || 0
  } catch (err) {
    console.log('Failed to load quick stats:', err.message)
  }
}

// ═══════════════════════════════════════════════════════════════
// Conversations (Sessions)
// ═══════════════════════════════════════════════════════════════

async function loadSessions() {
  const listEl = document.getElementById('sessions-list')
  if (!listEl) return
  
  listEl.innerHTML = '<p class="loading">Loading conversations...</p>'
  
  try {
    const result = await rpcCall('sessions.list')
    state.sessions = result?.sessions || []
    
    if (!state.sessions.length) {
      listEl.innerHTML = '<div class="empty-state"><p>No active conversations</p></div>'
      return
    }
    
    listEl.innerHTML = state.sessions.map(session => `
      <div class="session-card" data-key="${session.key}">
        <div class="session-header">
          <span class="session-name">${session.label || session.key}</span>
          <span class="session-channel">${session.channel || 'unknown'}</span>
        </div>
        <div class="session-meta">
          <span class="dim">Last active: ${formatTime(session.lastActivity)}</span>
        </div>
        <div class="session-controls">
          <label class="toggle-control">
            <input type="checkbox" ${session.thinking ? 'checked' : ''} 
                   onchange="toggleSessionThinking('${session.key}', this.checked)">
            <span>Thinking</span>
          </label>
          <label class="toggle-control">
            <input type="checkbox" ${session.verbose ? 'checked' : ''} 
                   onchange="toggleSessionVerbose('${session.key}', this.checked)">
            <span>Verbose</span>
          </label>
        </div>
      </div>
    `).join('')
  } catch (err) {
    listEl.innerHTML = `<div class="error-state"><p>Failed to load: ${err.message}</p></div>`
  }
}

window.toggleSessionThinking = async (key, enabled) => {
  try {
    await rpcCall('sessions.patch', { key, thinking: enabled })
  } catch (err) {
    console.error('Failed to update session:', err)
  }
}

window.toggleSessionVerbose = async (key, enabled) => {
  try {
    await rpcCall('sessions.patch', { key, verbose: enabled })
  } catch (err) {
    console.error('Failed to update session:', err)
  }
}

// ═══════════════════════════════════════════════════════════════
// Channels
// ═══════════════════════════════════════════════════════════════

async function loadChannels() {
  const gridEl = document.getElementById('channels-grid')
  if (!gridEl) return
  
  gridEl.innerHTML = '<p class="loading">Loading channels...</p>'
  
  try {
    const result = await rpcCall('channels.status')
    const channels = result?.channels || result || {}
    state.channels = channels
    
    const channelArray = Object.entries(channels)
    
    if (!channelArray.length) {
      gridEl.innerHTML = '<div class="empty-state"><p>No channels configured</p></div>'
      return
    }
    
    gridEl.innerHTML = channelArray.map(([name, info]) => {
      const status = info.connected ? 'connected' : (info.ready ? 'ready' : 'offline')
      const canQR = ['whatsapp', 'telegram'].includes(name.toLowerCase()) && !info.connected
      
      return `
        <div class="channel-card">
          <div class="channel-header">
            <span class="channel-icon">${getChannelIcon(name)}</span>
            <span class="channel-name">${capitalise(name)}</span>
          </div>
          <div class="channel-status ${status}">
            <span class="status-dot"></span>
            <span>${capitalise(status)}</span>
          </div>
          ${info.user ? `<div class="channel-user dim">@${info.user}</div>` : ''}
          ${canQR ? `<button class="btn btn-subtle btn-small" onclick="showQRLogin('${name}')">Connect</button>` : ''}
        </div>
      `
    }).join('')
  } catch (err) {
    gridEl.innerHTML = `<div class="error-state"><p>Failed to load: ${err.message}</p></div>`
  }
}

window.showQRLogin = async (channel) => {
  const modal = document.getElementById('qr-modal')
  const container = document.getElementById('qr-container')
  const title = document.getElementById('qr-modal-title')
  
  if (!modal || !container) return
  
  title.textContent = `Connect ${capitalise(channel)}`
  container.innerHTML = '<p class="loading">Generating QR code...</p>'
  modal.classList.add('active')
  
  try {
    const result = await rpcCall(`web.login.${channel}`)
    if (result?.qr) {
      // Render QR code (simple text for now, could use qrcode library)
      container.innerHTML = `<pre class="qr-text">${result.qr}</pre>`
    } else if (result?.url) {
      container.innerHTML = `<a href="${result.url}" target="_blank" class="btn btn-warm">Open Login Page</a>`
    } else {
      container.innerHTML = '<p class="dim">No QR code available</p>'
    }
  } catch (err) {
    container.innerHTML = `<p class="error">${err.message}</p>`
  }
}

function initQRModal() {
  const modal = document.getElementById('qr-modal')
  const closeBtn = document.getElementById('qr-close')
  
  closeBtn?.addEventListener('click', () => {
    modal.classList.remove('active')
  })
  
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.classList.remove('active')
    }
  })
}

// ═══════════════════════════════════════════════════════════════
// Workers (Household)
// ═══════════════════════════════════════════════════════════════

async function loadWorkers() {
  const grid = document.getElementById('workers-grid')
  if (!grid) return
  
  try {
    const res = await fetch('/api/workers')
    const workers = await res.json()
    state.workers = workers
    
    if (workers.length === 0) {
      grid.innerHTML = `
        <div class="empty-state">
          <p>The household is quiet.</p>
          <p class="dim">No workers have been invited yet.</p>
        </div>
      `
      return
    }
    
    grid.innerHTML = workers.map(worker => `
      <div class="worker-card" data-id="${worker.id}">
        <div class="worker-card-header">
          <div class="worker-name">${worker.id}</div>
          <div class="worker-status ${worker.status}">${worker.status}</div>
        </div>
        <div class="worker-role">${worker.role}</div>
        <div class="worker-time">${formatTime(worker.lastActivity)}</div>
      </div>
    `).join('')
    
    grid.querySelectorAll('.worker-card').forEach(card => {
      card.addEventListener('click', () => {
        openWorkerDetail(card.dataset.id)
      })
    })
  } catch (err) {
    grid.innerHTML = `<div class="error-state">Unable to load workers: ${err.message}</div>`
  }
}

async function openWorkerDetail(workerId) {
  try {
    const res = await fetch(`/api/workers/${workerId}`)
    const worker = await res.json()
    state.selectedWorker = worker
    
    const detail = document.getElementById('worker-detail')
    
    const filesHtml = Object.entries(worker.files)
      .filter(([_, content]) => content)
      .map(([name, content]) => `
        <div class="worker-file">
          <div class="worker-file-title">${name}</div>
          <div class="worker-file-content">${escapeHtml(content)}</div>
        </div>
      `).join('')
    
    detail.innerHTML = `
      <div class="worker-detail-header">
        <h1>${worker.id}</h1>
        <div class="worker-detail-meta">
          <span class="worker-status ${worker.status}">${worker.status}</span>
          <span>Last active: ${formatTime(worker.lastActivity)}</span>
        </div>
      </div>
      ${filesHtml}
    `
    
    switchView('worker-detail')
  } catch (err) {
    console.error('Failed to load worker:', err)
  }
}

function initSpawnModal() {
  const modal = document.getElementById('spawn-modal')
  const openBtn = document.getElementById('invite-worker-btn')
  const cancelBtn = document.getElementById('spawn-cancel')
  const form = document.getElementById('spawn-form')
  const result = document.getElementById('spawn-result')
  
  openBtn?.addEventListener('click', () => {
    modal.classList.add('active')
  })
  
  cancelBtn?.addEventListener('click', () => {
    modal.classList.remove('active')
  })
  
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.classList.remove('active')
    }
  })
  
  form?.addEventListener('submit', async (e) => {
    e.preventDefault()
    
    const taskId = document.getElementById('spawn-id').value.trim()
    const role = document.getElementById('spawn-role').value.trim()
    const description = document.getElementById('spawn-task').value.trim()
    
    result.className = 'spawn-result'
    result.style.display = 'none'
    
    try {
      const res = await fetch('/api/workers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId, role, description })
      })
      
      const data = await res.json()
      
      if (res.ok) {
        result.className = 'spawn-result success'
        result.textContent = `✓ Worker "${taskId}" has been invited. They're waking up now.`
        result.style.display = 'block'
        form.reset()
        
        setTimeout(() => {
          modal.classList.remove('active')
          loadWorkers()
        }, 2000)
      } else {
        throw new Error(data.error || 'Spawn failed')
      }
    } catch (err) {
      result.className = 'spawn-result error'
      result.textContent = `Something went wrong: ${err.message}`
      result.style.display = 'block'
    }
  })
}

// ═══════════════════════════════════════════════════════════════
// Routines (Cron Jobs)
// ═══════════════════════════════════════════════════════════════

async function loadCrons() {
  const listEl = document.getElementById('routines-list')
  if (!listEl) return
  
  listEl.innerHTML = '<p class="loading">Loading routines...</p>'
  
  try {
    const result = await rpcCall('cron.list')
    state.crons = result?.jobs || []
    
    if (!state.crons.length) {
      listEl.innerHTML = '<div class="empty-state"><p>No routines scheduled</p></div>'
      return
    }
    
    listEl.innerHTML = state.crons.map(job => `
      <div class="routine-card" data-id="${job.id}">
        <div class="routine-header">
          <span class="routine-name">${job.name || job.id}</span>
          <span class="routine-schedule dim">${job.schedule}</span>
        </div>
        <div class="routine-message">${escapeHtml(job.message || '').slice(0, 100)}${(job.message?.length || 0) > 100 ? '...' : ''}</div>
        <div class="routine-meta">
          ${job.channel ? `<span class="dim">→ ${job.channel}</span>` : ''}
          ${job.lastRun ? `<span class="dim">Last: ${formatTime(job.lastRun)}</span>` : ''}
        </div>
        <div class="routine-controls">
          <button class="btn btn-subtle btn-small" onclick="runCron('${job.id}')">Run Now</button>
          <button class="btn btn-subtle btn-small" onclick="toggleCron('${job.id}', ${!job.enabled})">
            ${job.enabled ? 'Disable' : 'Enable'}
          </button>
          <button class="btn btn-subtle btn-small btn-danger" onclick="deleteCron('${job.id}')">Delete</button>
        </div>
      </div>
    `).join('')
  } catch (err) {
    listEl.innerHTML = `<div class="error-state"><p>Failed to load: ${err.message}</p></div>`
  }
}

window.runCron = async (id) => {
  try {
    await rpcCall('cron.run', { id })
    alert('Routine triggered!')
  } catch (err) {
    alert(`Failed to run: ${err.message}`)
  }
}

window.toggleCron = async (id, enabled) => {
  try {
    await rpcCall(enabled ? 'cron.enable' : 'cron.disable', { id })
    loadCrons()
  } catch (err) {
    alert(`Failed to toggle: ${err.message}`)
  }
}

window.deleteCron = async (id) => {
  if (!confirm('Delete this routine?')) return
  try {
    await rpcCall('cron.delete', { id })
    loadCrons()
  } catch (err) {
    alert(`Failed to delete: ${err.message}`)
  }
}

function initRoutineModal() {
  const modal = document.getElementById('routine-modal')
  const openBtn = document.getElementById('add-routine-btn')
  const cancelBtn = document.getElementById('routine-cancel')
  const form = document.getElementById('routine-form')
  
  openBtn?.addEventListener('click', () => {
    modal.classList.add('active')
  })
  
  cancelBtn?.addEventListener('click', () => {
    modal.classList.remove('active')
  })
  
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.classList.remove('active')
    }
  })
  
  form?.addEventListener('submit', async (e) => {
    e.preventDefault()
    
    const name = document.getElementById('routine-name').value.trim()
    const schedule = document.getElementById('routine-schedule').value.trim()
    const channel = document.getElementById('routine-channel').value.trim() || 'webchat'
    const message = document.getElementById('routine-message').value.trim()
    
    try {
      await rpcCall('cron.add', { name, schedule, channel, message })
      modal.classList.remove('active')
      form.reset()
      loadCrons()
    } catch (err) {
      alert(`Failed to create routine: ${err.message}`)
    }
  })
}

// ═══════════════════════════════════════════════════════════════
// Skills
// ═══════════════════════════════════════════════════════════════

async function loadSkills() {
  const gridEl = document.getElementById('skills-grid')
  if (!gridEl) return
  
  gridEl.innerHTML = '<p class="loading">Loading skills...</p>'
  
  try {
    const result = await rpcCall('skills.status')
    state.skills = result?.skills || []
    
    if (!state.skills.length) {
      gridEl.innerHTML = '<div class="empty-state"><p>No skills installed</p></div>'
      return
    }
    
    gridEl.innerHTML = state.skills.map(skill => `
      <div class="skill-card ${skill.enabled ? 'enabled' : 'disabled'}">
        <div class="skill-header">
          <span class="skill-name">${skill.name}</span>
          <span class="skill-status">${skill.enabled ? '✓ Active' : '○ Inactive'}</span>
        </div>
        <div class="skill-description dim">${skill.description || 'No description'}</div>
        <div class="skill-controls">
          <button class="btn btn-subtle btn-small" onclick="toggleSkill('${skill.id}', ${!skill.enabled})">
            ${skill.enabled ? 'Disable' : 'Enable'}
          </button>
        </div>
      </div>
    `).join('')
  } catch (err) {
    gridEl.innerHTML = `<div class="error-state"><p>Failed to load: ${err.message}</p></div>`
  }
}

window.toggleSkill = async (id, enabled) => {
  try {
    await rpcCall(enabled ? 'skills.enable' : 'skills.disable', { id })
    loadSkills()
  } catch (err) {
    alert(`Failed to toggle skill: ${err.message}`)
  }
}

// ═══════════════════════════════════════════════════════════════
// Friends (Nodes)
// ═══════════════════════════════════════════════════════════════

async function loadNodes() {
  const gridEl = document.getElementById('nodes-grid')
  if (!gridEl) return
  
  gridEl.innerHTML = '<p class="loading">Looking for friends...</p>'
  
  try {
    const result = await rpcCall('node.list')
    state.nodes = result?.nodes || []
    
    if (!state.nodes.length) {
      gridEl.innerHTML = '<div class="empty-state"><p>No friends paired yet</p><p class="dim">Use the mobile app to pair a device</p></div>'
      return
    }
    
    gridEl.innerHTML = state.nodes.map(node => `
      <div class="node-card ${node.online ? 'online' : 'offline'}">
        <div class="node-icon">${getNodeIcon(node.type)}</div>
        <div class="node-info">
          <div class="node-name">${node.name || node.id}</div>
          <div class="node-status ${node.online ? 'online' : 'offline'}">
            ${node.online ? '● Online' : '○ Offline'}
          </div>
          ${node.capabilities ? `
            <div class="node-caps">
              ${node.capabilities.map(cap => `<span class="cap-badge">${cap}</span>`).join('')}
            </div>
          ` : ''}
        </div>
      </div>
    `).join('')
  } catch (err) {
    gridEl.innerHTML = `<div class="error-state"><p>Failed to load: ${err.message}</p></div>`
  }
}

// ═══════════════════════════════════════════════════════════════
// Library
// ═══════════════════════════════════════════════════════════════

async function loadLibrary(path = '') {
  state.libraryPath = path
  const grid = document.getElementById('library-grid')
  const breadcrumb = document.getElementById('library-breadcrumb')
  
  // Update breadcrumb
  const parts = path ? path.split('/') : []
  let crumbHtml = '<a href="#" data-path="">library</a>'
  let accumulated = ''
  for (const part of parts) {
    accumulated += (accumulated ? '/' : '') + part
    crumbHtml += ` <span>/</span> <a href="#" data-path="${accumulated}">${part}</a>`
  }
  breadcrumb.innerHTML = crumbHtml
  
  breadcrumb.querySelectorAll('a').forEach(a => {
    a.addEventListener('click', (e) => {
      e.preventDefault()
      loadLibrary(a.dataset.path)
    })
  })
  
  try {
    const res = await fetch(`/api/library?path=${encodeURIComponent(path)}`)
    const data = await res.json()
    
    if (data.items.length === 0) {
      grid.innerHTML = '<div class="empty-state">This shelf is empty.</div>'
      return
    }
    
    grid.innerHTML = data.items.map(item => `
      <div class="library-item" data-path="${item.path}" data-dir="${item.isDirectory}">
        <div class="library-item-icon">${item.isDirectory ? '📁' : '📄'}</div>
        <div class="library-item-name">${item.name}</div>
      </div>
    `).join('')
    
    grid.querySelectorAll('.library-item').forEach(item => {
      item.addEventListener('click', () => {
        if (item.dataset.dir === 'true') {
          loadLibrary(item.dataset.path)
        } else {
          openLibraryFile(item.dataset.path)
        }
      })
    })
  } catch (err) {
    grid.innerHTML = `<div class="error-state">Unable to browse: ${err.message}</div>`
  }
}

async function openLibraryFile(path) {
  try {
    const res = await fetch(`/api/library/file?path=${encodeURIComponent(path)}`)
    const data = await res.json()
    alert(`File: ${path}\n\n${data.content.slice(0, 1000)}${data.content.length > 1000 ? '...' : ''}`)
  } catch (err) {
    alert(`Could not open file: ${err.message}`)
  }
}

// ═══════════════════════════════════════════════════════════════
// Settings (Config, Debug, Logs)
// ═══════════════════════════════════════════════════════════════

async function loadConfig() {
  const jsonEl = document.getElementById('config-json')
  if (!jsonEl) return
  
  try {
    const result = await rpcCall('config.get')
    state.config = result?.config || result
    jsonEl.textContent = JSON.stringify(state.config, null, 2)
  } catch (err) {
    jsonEl.textContent = `Failed to load config: ${err.message}`
  }
}

function initDebugControls() {
  document.getElementById('snapshot-status')?.addEventListener('click', async () => {
    const output = document.getElementById('debug-snapshot')
    try {
      const result = await rpcCall('status')
      output.textContent = JSON.stringify(result, null, 2)
    } catch (err) {
      output.textContent = `Error: ${err.message}`
    }
  })
  
  document.getElementById('snapshot-health')?.addEventListener('click', async () => {
    const output = document.getElementById('debug-snapshot')
    try {
      const result = await rpcCall('health')
      output.textContent = JSON.stringify(result, null, 2)
    } catch (err) {
      output.textContent = `Error: ${err.message}`
    }
  })
  
  document.getElementById('snapshot-models')?.addEventListener('click', async () => {
    const output = document.getElementById('debug-snapshot')
    try {
      const result = await rpcCall('models.list')
      output.textContent = JSON.stringify(result, null, 2)
    } catch (err) {
      output.textContent = `Error: ${err.message}`
    }
  })
  
  document.getElementById('refresh-config')?.addEventListener('click', loadConfig)
}

function initTokenConfig() {
  const tokenInput = document.getElementById('gateway-token')
  const showBtn = document.getElementById('show-token-btn')
  const saveBtn = document.getElementById('save-token-btn')
  
  // Load existing token
  if (tokenInput) {
    tokenInput.value = localStorage.getItem('bloom-gateway-token') || ''
  }
  
  // Toggle token visibility
  showBtn?.addEventListener('click', () => {
    if (tokenInput.type === 'password') {
      tokenInput.type = 'text'
      showBtn.textContent = 'Hide'
    } else {
      tokenInput.type = 'password'
      showBtn.textContent = 'Show'
    }
  })
  
  // Save token and reconnect
  saveBtn?.addEventListener('click', () => {
    const token = tokenInput?.value?.trim()
    if (token) {
      localStorage.setItem('bloom-gateway-token', token)
      state.wsToken = token
      
      // Close existing connection and reconnect
      if (state.ws) {
        state.ws.close()
      }
      
      setTimeout(initGateway, 500)
      alert('Token saved! Reconnecting...')
    } else {
      localStorage.removeItem('bloom-gateway-token')
      alert('Token cleared.')
    }
  })
}

function updateEventLogUI() {
  const logEl = document.getElementById('event-log')
  if (!logEl || state.currentView !== 'settings') return
  
  logEl.innerHTML = state.eventLog.slice(0, 50).map(entry => `
    <div class="event-entry">
      <span class="event-time">${new Date(entry.time).toLocaleTimeString()}</span>
      <span class="event-type">${entry.data.method || entry.data.event || 'unknown'}</span>
    </div>
  `).join('') || '<p class="dim">No events yet</p>'
}

// ═══════════════════════════════════════════════════════════════
// Logs
// ═══════════════════════════════════════════════════════════════

async function subscribeToLogs() {
  if (state.logsSubscribed) return
  
  try {
    await rpcCall('logs.tail', { lines: 100 })
    state.logsSubscribed = true
  } catch (err) {
    console.log('Failed to subscribe to logs:', err.message)
  }
}

function addLogEntry(entry) {
  state.logs.push(entry)
  if (state.logs.length > 500) {
    state.logs = state.logs.slice(-500)
  }
  
  updateLogsUI()
}

function updateLogsUI() {
  const viewer = document.getElementById('logs-viewer')
  const filter = document.getElementById('logs-filter')?.value?.toLowerCase() || ''
  const autoScroll = document.getElementById('logs-autoscroll-toggle')?.checked ?? true
  
  if (!viewer || state.currentView !== 'settings') return
  
  let filteredLogs = state.logs
  if (filter) {
    filteredLogs = state.logs.filter(log => 
      JSON.stringify(log).toLowerCase().includes(filter)
    )
  }
  
  viewer.innerHTML = filteredLogs.slice(-200).map(log => {
    const level = log.level || 'info'
    const time = log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : ''
    const msg = log.message || log.msg || JSON.stringify(log)
    
    return `<div class="log-entry log-${level}">
      <span class="log-time">${time}</span>
      <span class="log-level">${level}</span>
      <span class="log-msg">${escapeHtml(msg)}</span>
    </div>`
  }).join('') || '<p class="dim">No logs yet</p>'
  
  if (autoScroll) {
    viewer.scrollTop = viewer.scrollHeight
  }
}

function initLogsControls() {
  document.getElementById('logs-filter')?.addEventListener('input', updateLogsUI)
  document.getElementById('logs-clear')?.addEventListener('click', () => {
    state.logs = []
    updateLogsUI()
  })
}

// ═══════════════════════════════════════════════════════════════
// Utilities
// ═══════════════════════════════════════════════════════════════

function formatTime(timestamp) {
  if (!timestamp) return 'Unknown'
  
  const date = new Date(timestamp)
  const now = new Date()
  const diffMs = now - date
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)
  
  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  
  return date.toLocaleDateString()
}

function formatUptime(seconds) {
  if (!seconds) return 'Unknown'
  const hours = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  if (hours > 24) {
    return `${Math.floor(hours / 24)}d ${hours % 24}h`
  }
  return `${hours}h ${mins}m`
}

function formatBytes(bytes) {
  if (!bytes) return 'Unknown'
  const mb = bytes / 1024 / 1024
  return `${mb.toFixed(1)} MB`
}

function formatModelName(id) {
  if (!id) return 'Unknown'
  // Extract the readable part from model IDs like "anthropic/claude-3-opus"
  const parts = id.split('/')
  return parts[parts.length - 1].replace(/-/g, ' ')
}

function capitalise(str) {
  if (!str) return ''
  return str.charAt(0).toUpperCase() + str.slice(1)
}

function escapeHtml(text) {
  if (!text) return ''
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

function getChannelIcon(name) {
  const icons = {
    whatsapp: '💬',
    telegram: '✈️',
    discord: '🎮',
    slack: '💼',
    webchat: '🌐',
    email: '📧'
  }
  return icons[name.toLowerCase()] || '📱'
}

function getInstanceIcon(type) {
  const icons = {
    gateway: '🏠',
    node: '📱',
    browser: '🌐',
    cli: '⌨️'
  }
  return icons[type?.toLowerCase()] || '💻'
}

function getNodeIcon(type) {
  const icons = {
    ios: '📱',
    android: '📱',
    macos: '💻',
    windows: '🖥️',
    linux: '🐧'
  }
  return icons[type?.toLowerCase()] || '📱'
}

// ═══════════════════════════════════════════════════════════════
// Initialize
// ═══════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
  initNavigation()
  initChat()
  initQRModal()
  initSpawnModal()
  initRoutineModal()
  initDebugControls()
  initLogsControls()
  initTokenConfig()
  
  // Load token from localStorage
  state.wsToken = localStorage.getItem('bloom-gateway-token') || ''
  
  // Connect to Gateway
  initGateway()
  
  // Auto-refresh data periodically
  setInterval(() => {
    if (state.wsConnected) {
      if (state.currentView === 'overview') loadOverviewData()
      if (state.currentView === 'conversations') loadSessions()
    }
  }, 30000)
})

// Export for inline handlers
window.showQRLogin = window.showQRLogin || (() => {})
