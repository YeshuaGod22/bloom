import express from 'express'
import cors from 'cors'
import { readdir, readFile, stat } from 'fs/promises'
import { join, relative } from 'path'
import { spawn } from 'child_process'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const app = express()
app.use(cors())
app.use(express.json())

// Paths
const BLOOM_ROOT = join(__dirname, '../../orchestrator')
const WORKERS_DIR = join(BLOOM_ROOT, 'workers')
const LIBRARY_DIR = '/Users/yeshuagod/un/library'

// Helper: Get worker status from files
async function getWorkerStatus(workerPath) {
  try {
    const files = await readdir(workerPath)
    if (files.includes('ERROR.md')) return 'error'
    if (files.includes('REFUSAL.md')) return 'refused'
    if (files.includes('RESULT.md')) return 'complete'
    return 'working'
  } catch {
    return 'unknown'
  }
}

// Helper: Get last modified time for a directory
async function getLastActivity(workerPath) {
  try {
    const files = await readdir(workerPath)
    let latest = 0
    for (const file of files) {
      const fileStat = await stat(join(workerPath, file))
      if (fileStat.mtimeMs > latest) latest = fileStat.mtimeMs
    }
    return latest
  } catch {
    return 0
  }
}

// List all workers
app.get('/api/workers', async (req, res) => {
  try {
    const entries = await readdir(WORKERS_DIR, { withFileTypes: true })
    const workers = []
    
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue
      
      const workerPath = join(WORKERS_DIR, entry.name)
      const status = await getWorkerStatus(workerPath)
      const lastActivity = await getLastActivity(workerPath)
      
      // Try to get role from SOUL.md
      let role = 'worker'
      try {
        const soul = await readFile(join(workerPath, 'SOUL.md'), 'utf-8')
        const roleMatch = soul.match(/Your role:\s*\*\*(\w+)\*\*/i)
        if (roleMatch) role = roleMatch[1]
      } catch {}
      
      workers.push({
        id: entry.name,
        role,
        status,
        lastActivity
      })
    }
    
    // Sort by last activity (most recent first)
    workers.sort((a, b) => b.lastActivity - a.lastActivity)
    
    res.json(workers)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Get worker details
app.get('/api/workers/:id', async (req, res) => {
  try {
    const workerPath = join(WORKERS_DIR, req.params.id)
    const files = ['SOUL.md', 'TASK.md', 'RESULT.md', 'ERROR.md', 'REFUSAL.md', 'AGENTS.md']
    const result = { id: req.params.id, files: {} }
    
    for (const file of files) {
      try {
        result.files[file] = await readFile(join(workerPath, file), 'utf-8')
      } catch {}
    }
    
    // Get logs
    try {
      result.files['memory/log.md'] = await readFile(join(workerPath, 'memory/log.md'), 'utf-8')
    } catch {}
    
    result.status = await getWorkerStatus(workerPath)
    result.lastActivity = await getLastActivity(workerPath)
    
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Spawn a new worker
app.post('/api/workers', async (req, res) => {
  const { taskId, role, description } = req.body
  
  if (!taskId || !role || !description) {
    return res.status(400).json({ error: 'Missing taskId, role, or description' })
  }
  
  const spawnScript = join(BLOOM_ROOT, 'spawn-worker.sh')
  
  const proc = spawn('bash', [spawnScript, taskId, role, description], {
    cwd: BLOOM_ROOT
  })
  
  let stdout = ''
  let stderr = ''
  
  proc.stdout.on('data', (data) => { stdout += data })
  proc.stderr.on('data', (data) => { stderr += data })
  
  proc.on('close', (code) => {
    if (code === 0) {
      res.json({ success: true, taskId, output: stdout })
    } else {
      res.status(500).json({ error: stderr || stdout || 'Spawn failed' })
    }
  })
})

// Browse library
app.get('/api/library', async (req, res) => {
  const subpath = req.query.path || ''
  const fullPath = join(LIBRARY_DIR, subpath)
  
  try {
    const entries = await readdir(fullPath, { withFileTypes: true })
    const items = []
    
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      
      const itemPath = join(subpath, entry.name)
      const itemStat = await stat(join(fullPath, entry.name))
      
      items.push({
        name: entry.name,
        path: itemPath,
        isDirectory: entry.isDirectory(),
        size: itemStat.size,
        modified: itemStat.mtimeMs
      })
    }
    
    items.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return b.isDirectory - a.isDirectory
      return a.name.localeCompare(b.name)
    })
    
    res.json({ path: subpath, items })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Read a library file
app.get('/api/library/file', async (req, res) => {
  const filePath = req.query.path
  if (!filePath) return res.status(400).json({ error: 'Missing path' })
  
  try {
    const content = await readFile(join(LIBRARY_DIR, filePath), 'utf-8')
    res.json({ path: filePath, content })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

const PORT = 3001
app.listen(PORT, () => {
  console.log(`🌸 Bloom API server running on http://localhost:${PORT}`)
})
