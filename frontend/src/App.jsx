import React, { useState, useEffect, useRef } from 'react';
import { signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import { auth, provider, isFirebaseConfigured } from './firebase';
import { 
  Key, Shield, Zap, RefreshCw, Terminal, Code, Cpu, 
  Settings, Play, BarChart3, Clock, Copy, Check, Info, ArrowRight,
  TrendingUp, Layers, LogIn, LogOut, User
} from 'lucide-react';
import { Bar } from 'react-chartjs-2';
import { 
  Chart as ChartJS, 
  CategoryScale, 
  LinearScale, 
  BarElement, 
  Title, 
  Tooltip, 
  Legend 
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

export default function App() {
  const [activeTab, setActiveTab] = useState('landing'); // 'landing' or 'dashboard'
  
  // Auth states
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, provider);
    } catch (err) {
      console.error("Login failed:", err);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error("Logout failed:", err);
    }
  };

  const fetchUserKeys = async () => {
    if (!auth.currentUser) {
      setUserKeys([]);
      return;
    }
    try {
      const token = await auth.currentUser.getIdToken();
      const res = await fetch('/api/keys', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        setUserKeys(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error("Error fetching user keys:", err);
    }
  };

  useEffect(() => {
    if (user) {
      fetchUserKeys();
    } else {
      setUserKeys([]);
    }
  }, [user]);

  const handleRevokeKey = async (targetKey) => {
    if (!user) return;
    if (!window.confirm("Are you sure you want to revoke this API key? This will permanently delete its config, logs, and stats.")) {
      return;
    }
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/keys/${targetKey}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (res.ok) {
        setUserKeys(prev => prev.filter(k => k.apiKey !== targetKey));
        if (apiKey === targetKey) {
          setApiKey('rl_demo_default');
        }
      } else {
        const errData = await res.json();
        alert(`Failed to revoke key: ${errData.error}`);
      }
    } catch (err) {
      console.error("Error revoking key:", err);
    }
  };
  
  // Dashboard states
  const [apiKey, setApiKey] = useState('rl_demo_default');
  const [algorithm, setAlgorithm] = useState('sliding-window');
  const [limit, setLimit] = useState(100);
  const [windowSize, setWindowSize] = useState(60);
  const [clientId, setClientId] = useState('developer_workspace');
  
  // Generating states
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  
  // Analytics and logs state
  const [stats, setStats] = useState({ total: 0, allowed: 0, blocked: 0, errors429: 0 });
  const [logs, setLogs] = useState([]);
  const [sseActive, setSseActive] = useState(false);
  
  // Playground / testing states
  const [testResponse, setTestResponse] = useState(null);
  const [testingSingle, setTestingSingle] = useState(false);
  const [testingStress, setTestingStress] = useState(false);
  const [stressProgress, setStressProgress] = useState(0);
  const [targetApiUrl, setTargetApiUrl] = useState('https://jsonplaceholder.typicode.com/posts/1');
  const [burstCount, setBurstCount] = useState(500);
  const [userKeys, setUserKeys] = useState([]);
  
  // Documentation code snippet state
  const [docLanguage, setDocLanguage] = useState('node');

  // SSE connection ref
  const sseRef = useRef(null);

  // Fetch initial analytics and logs
  const fetchTelemetry = async (key) => {
    try {
      const statsRes = await fetch(`/api/analytics/${key}`);
      if (!statsRes.ok) throw new Error("Stats request failed");
      const statsData = await statsRes.json();
      setStats(statsData || { total: 0, allowed: 0, blocked: 0, errors429: 0 });

      const logsRes = await fetch(`/api/logs/${key}`);
      if (!logsRes.ok) throw new Error("Logs request failed");
      const logsData = await logsRes.json();
      setLogs(Array.isArray(logsData) ? logsData : []);
    } catch (err) {
      console.error("Failed to load telemetry:", err);
      // Fail-safe defaults to prevent frontend crashes
      setStats({ total: 0, allowed: 0, blocked: 0, errors429: 0 });
      setLogs([]);
    }
  };


  // Connect to SSE stream
  const connectSSE = (key) => {
    if (sseRef.current) {
      sseRef.current.close();
    }

    setSseActive(true);
    const sse = new EventSource(`/api/stream/${key}`);
    sseRef.current = sse;

    sse.onmessage = (event) => {
      const newLog = JSON.parse(event.data);
      setLogs(prev => [newLog, ...prev.slice(0, 49)]);
      
      // Update statistics locally in real time
      setStats(prev => {
        const allowedInc = newLog.allowed ? 1 : 0;
        const blockedInc = newLog.allowed ? 0 : 1;
        return {
          total: prev.total + 1,
          allowed: prev.allowed + allowedInc,
          blocked: prev.blocked + blockedInc,
          errors429: prev.errors429 + blockedInc
        };
      });
    };

    sse.onerror = (err) => {
      console.warn("SSE connection error, closing stream:", err);
      sse.close();
      setSseActive(false);
    };
  };

  // When active API Key changes, fetch new telemetry and reconnect SSE
  useEffect(() => {
    // Reset stats/logs for smooth UI transition
    setStats({ total: 0, allowed: 0, blocked: 0, errors429: 0 });
    setLogs([]);
    
    if (activeTab === 'dashboard') {
      fetchTelemetry(apiKey);
      connectSSE(apiKey);
    }
    return () => {
      if (sseRef.current) {
        sseRef.current.close();
        setSseActive(false);
      }
    };
  }, [apiKey, activeTab]);

  // Generate a new custom key
  const handleGenerateKey = async (e) => {
    e.preventDefault();
    setGenerating(true);
    try {
      let token = null;
      if (user) {
        token = await user.getIdToken();
      }

      const res = await fetch('/api/keys/generate', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          clientId,
          algorithm,
          limit: parseInt(limit),
          window: parseInt(windowSize)
        })
      });
      const data = await res.json();
      setApiKey(data.apiKey);
      
      // Auto-copy generated key to clipboard
      navigator.clipboard.writeText(data.apiKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      
      if (user) {
        fetchUserKeys();
      }
    } catch (err) {
      console.error("Error generating key:", err);
    } finally {
      setGenerating(false);
    }
  };

  // Copy API key to clipboard
  const copyToClipboard = () => {
    navigator.clipboard.writeText(apiKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Send a single test request
  const handleTestRequest = async () => {
    setTestingSingle(true);
    try {
      const start = performance.now();
      const res = await fetch('/api/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey
        },
        body: JSON.stringify({ targetUrl: targetApiUrl })
      });
      const duration = (performance.now() - start).toFixed(1);
      const data = await res.json();
      
      setTestResponse({
        status: res.status,
        statusText: res.statusText,
        latency: `${duration}ms`,
        body: data,
        headers: {
          'x-ratelimit-limit': res.headers.get('x-ratelimit-limit'),
          'x-ratelimit-remaining': res.headers.get('x-ratelimit-remaining'),
          'x-ratelimit-reset': res.headers.get('x-ratelimit-reset'),
          'retry-after': res.headers.get('retry-after')
        }
      });
      
      // Pull latest statistics to ensure synchronization
      setTimeout(() => fetchTelemetry(apiKey), 100);
    } catch (err) {
      setTestResponse({
        status: 500,
        statusText: "Internal Error",
        body: { error: err.message }
      });
    } finally {
      setTestingSingle(false);
    }
  };

  // Send burst requests
  const handleStressTest = async () => {
    setTestingStress(true);
    setStressProgress(0);
    
    let count = parseInt(burstCount);
    if (isNaN(count) || count < 1) count = 10;
    if (count > 1000) count = 1000;
    
    const batchSize = Math.min(25, count); // 25 concurrent requests at a time
    const totalRequests = count;
    const iterations = Math.ceil(totalRequests / batchSize);

    for (let i = 0; i < iterations; i++) {
      const currentBatchSize = Math.min(batchSize, totalRequests - (i * batchSize));
      const promises = Array.from({ length: currentBatchSize }).map(() => 
        fetch('/api/test', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey
          },
          body: JSON.stringify({ targetUrl: targetApiUrl })
        }).catch(err => console.error("Request failed during burst:", err))
      );

      await Promise.all(promises);
      setStressProgress(Math.round(((i + 1) / iterations) * 100));
      // Small delay to prevent blocking browser thread completely
      await new Promise(resolve => setTimeout(resolve, 80));
    }

    setTestingStress(false);
    // Fetch final telemetry
    setTimeout(() => fetchTelemetry(apiKey), 300);
  };

  // Setup Chart JS details
  const chartData = {
    labels: ['Requests Tally'],
    datasets: [
      {
        label: 'Allowed Requests',
        data: [stats.allowed],
        backgroundColor: 'rgba(16, 185, 129, 0.85)', // Emerald
        borderColor: 'rgb(16, 185, 129)',
        borderWidth: 1,
        borderRadius: 6,
      },
      {
        label: 'Blocked Requests (429)',
        data: [stats.blocked],
        backgroundColor: 'rgba(239, 68, 68, 0.85)', // Red
        borderColor: 'rgb(239, 68, 68)',
        borderWidth: 1,
        borderRadius: 6,
      }
    ]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
        labels: { color: '#e2e8f0' }
      },
      title: { display: false }
    },
    scales: {
      x: { grid: { color: '#334155' }, ticks: { color: '#e2e8f0' } },
      y: { grid: { color: '#334155' }, ticks: { color: '#e2e8f0', precision: 0 } }
    }
  };

  // Code snippets for developer docs
  const codeSnippets = {
    node: `// Node.js implementation
const apiKey = "${apiKey}";

async function makeRequest() {
  try {
    const response = await fetch("http://localhost:3000/api/test", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey
      }
    });

    if (response.status === 429) {
      const retryAfter = response.headers.get("retry-after");
      console.warn(\`Rate limited. Retry after \${retryAfter}s\`);
      return;
    }

    const data = await response.json();
    console.log("Success:", data);
  } catch (error) {
    console.error("Error:", error);
  }
}`,
    python: `# Python implementation
import requests
import time

api_key = "${apiKey}"
url = "http://localhost:3000/api/test"
headers = {
    "x-api-key": api_key,
    "Content-Type": "application/json"
}

def make_request():
    response = requests.post(url, headers=headers)
    if response.status_code == 429:
        retry_after = response.headers.get("Retry-After", 1)
        print(f"Rate limited. Sleep for {retry_after} seconds.")
        time.sleep(int(retry_after))
        return
    print("Response:", response.json())
`,
    express: `// Express.js rate limiter integration
const express = require('express');
const app = express();

const RATE_LIMITER_URL = "http://localhost:3000/api/test";

// Middleware to forward keys
const distributedRateLimit = async (req, res, next) => {
  const clientKey = req.headers['x-api-key'] || 'rl_demo_default';
  
  try {
    const check = await fetch(RATE_LIMITER_URL, {
      method: "POST",
      headers: { "x-api-key": clientKey }
    });

    // Forward rate limit headers
    res.set('X-RateLimit-Limit', check.headers.get('x-ratelimit-limit'));
    res.set('X-RateLimit-Remaining', check.headers.get('x-ratelimit-remaining'));
    res.set('X-RateLimit-Reset', check.headers.get('x-ratelimit-reset'));

    if (check.status === 429) {
      res.set('Retry-After', check.headers.get('retry-after'));
      return res.status(429).json({ error: 'Too Many Requests' });
    }

    next();
  } catch (err) {
    // Fail-open strategy if limiter goes down
    console.error('Rate limiter unreachable:', err);
    next();
  }
};

app.use(distributedRateLimit);
`,
    nextjs: `// Next.js Middleware Rate Limiter (Edge Runtime)
import { NextResponse } from 'next/server';

export async function middleware(request) {
  const apiKey = request.headers.get('x-api-key') || 'rl_demo_default';
  
  const res = await fetch('http://localhost:3000/api/test', {
    method: 'POST',
    headers: { 'x-api-key': apiKey }
  });

  if (res.status === 429) {
    return new NextResponse(
      JSON.stringify({ error: 'Too Many Requests' }),
      {
        status: 429,
        headers: {
          'content-type': 'application/json',
          'retry-after': res.headers.get('retry-after') || '60'
        }
      }
    );
  }

  return NextResponse.next();
}
`,
    curl: `# cURL command line execution
curl -i -X POST http://localhost:3000/api/test \\
  -H "x-api-key: ${apiKey}" \\
  -H "Content-Type: application/json"
`
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans antialiased selection:bg-indigo-500 selection:text-white">
      {/* Dynamic Background Glows */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl -z-10" />
      <div className="absolute top-1/2 right-1/4 w-96 h-96 bg-emerald-600/10 rounded-full blur-3xl -z-10" />

      {/* Navigation Header */}
      <header className="sticky top-0 bg-slate-950/80 backdrop-blur-md border-b border-slate-800 z-50 transition-all duration-300">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => setActiveTab('landing')}>
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-600/30 border border-indigo-400/20">
              <Cpu className="w-5 h-5 text-indigo-200" />
            </div>
            <div>
              <span className="font-extrabold text-xl tracking-tight bg-gradient-to-r from-indigo-200 via-indigo-400 to-indigo-100 bg-clip-text text-transparent">
                RateLimiterX
              </span>
              <span className="hidden md:inline-block text-[10px] font-semibold uppercase tracking-wider text-slate-500 ml-2 bg-slate-900 border border-slate-800 px-2 py-0.5 rounded-full">
                v2.0 Core
              </span>
            </div>
          </div>

          <nav className="flex items-center gap-1 sm:gap-4">
            <button 
              onClick={() => setActiveTab('landing')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'landing' 
                  ? 'text-white bg-slate-900 border border-slate-800' 
                  : 'text-slate-400 hover:text-white hover:bg-slate-900/50'
              }`}
            >
              Overview
            </button>
            <button 
              onClick={() => setActiveTab('dashboard')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 ${
                activeTab === 'dashboard' 
                  ? 'text-emerald-400 bg-emerald-950/30 border border-emerald-500/20' 
                  : 'text-slate-400 hover:text-white hover:bg-slate-900/50'
              }`}
            >
              <Zap className="w-4 h-4" />
              SaaS Console
            </button>
            
            <div className="h-6 w-px bg-slate-800 mx-1 hidden sm:block"></div>

            {authLoading ? (
              <div className="w-8 h-8 rounded-full bg-slate-900 animate-pulse border border-slate-800 hidden sm:block"></div>
            ) : user ? (
              <div className="flex items-center gap-3">
                <div className="hidden sm:flex items-center gap-2 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-full">
                  {user.photoURL ? (
                    <img src={user.photoURL} alt="User" className="w-5 h-5 rounded-full" />
                  ) : (
                    <User className="w-4 h-4 text-slate-400" />
                  )}
                  <span className="text-xs text-slate-300 font-medium truncate max-w-[120px]">{user.displayName || user.email}</span>
                </div>
                <button 
                  onClick={handleLogout}
                  className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                  title="Sign Out"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button 
                onClick={handleLogin}
                className="px-4 py-2 bg-white hover:bg-slate-200 text-slate-950 text-sm font-bold rounded-lg flex items-center gap-2 transition-all shadow-md shadow-white/10"
              >
                <LogIn className="w-4 h-4" />
                <span className="hidden sm:inline">Sign in with Google</span>
                <span className="sm:hidden">Sign In</span>
              </button>
            )}
          </nav>
        </div>
      </header>

      {/* Dev Sandbox Warning Banner */}
      {!isFirebaseConfigured && (
        <div className="bg-amber-955 bg-amber-950/40 border-b border-amber-900/30 text-amber-300 py-2 px-4 text-center text-[11px] font-medium flex items-center justify-center gap-2 shadow-inner">
          <Info className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span>Running in Local Sandbox Mode. Paste your Firebase credentials in <code className="bg-amber-950 px-1 py-0.5 rounded text-amber-200">firebase.js</code> to enable Google Account registration.</span>
        </div>
      )}

      {/* Main SaaS Content */}
      <main>
        {activeTab === 'landing' ? (
          /* ========================================================================= */
          /* LANDING PAGE                                                              */
          /* ========================================================================= */
          <div className="transition-opacity duration-300">
            {/* Hero Section */}
            <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-16 text-center">
              <div className="inline-flex items-center gap-1.5 bg-indigo-950/40 border border-indigo-550/30 rounded-full px-3 py-1 text-xs text-indigo-300 font-medium mb-6">
                <Shield className="w-3.5 h-3.5" /> High Performance Redis-Native Limiter
              </div>
              <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-white mb-6 leading-tight max-w-4xl mx-auto">
                Scalable API Rate Limiting for{' '}
                <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-emerald-400 bg-clip-text text-transparent">
                  Modern API Infrastructure
                </span>
              </h1>
              <p className="text-lg sm:text-xl text-slate-400 max-w-2xl mx-auto mb-10 leading-relaxed">
                Add ultra-low latency rate limits to your backend APIs in under 5 minutes. Armed with Redis Lua scripts, token buckets, and real-time dashboard telemetry.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <button 
                  onClick={() => setActiveTab('dashboard')}
                  className="w-full sm:w-auto px-8 py-4 bg-indigo-600 hover:bg-indigo-550 text-white font-semibold rounded-xl transition-all shadow-lg shadow-indigo-600/35 hover:-translate-y-0.5 flex items-center justify-center gap-2 group cursor-pointer"
                >
                  Explore Interactive Dashboard
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </button>
                <button 
                  onClick={() => setActiveTab('dashboard')}
                  className="w-full sm:w-auto px-8 py-4 bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 hover:border-slate-700 font-semibold rounded-xl transition-all flex items-center justify-center cursor-pointer"
                >
                  Get Started Free
                </button>
              </div>
            </section>

            {/* Quick Demo Section (Teaser of Live Limiter) */}
            <section className="max-w-5xl mx-auto px-4 mb-24">
              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 md:p-8 backdrop-blur-md shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-2xl" />
                
                <div className="flex flex-col lg:flex-row gap-8 items-center">
                  <div className="lg:w-1/2 text-left">
                    <span className="text-xs uppercase tracking-widest text-indigo-400 font-bold">Interactive Sandbox</span>
                    <h3 className="text-2xl font-bold text-white mt-1 mb-4">Test our algorithm response instantly</h3>
                    <p className="text-slate-400 text-sm leading-relaxed mb-6">
                      Click the live dashboard console to switch between algorithms. Simulate high-throughput API keys, custom quotas, and watch the charts trigger 429 Too Many Requests dynamically.
                    </p>
                    <button 
                      onClick={() => setActiveTab('dashboard')}
                      className="px-5 py-2.5 bg-slate-950 hover:bg-slate-900 border border-indigo-500/30 text-indigo-300 hover:text-white rounded-lg text-sm font-semibold transition-all inline-flex items-center gap-2 cursor-pointer"
                    >
                      Open Live Playground <Play className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  
                  <div className="lg:w-1/2 w-full bg-slate-950 border border-slate-800 rounded-xl p-4 font-mono text-xs">
                    <div className="flex justify-between items-center pb-2 border-b border-slate-800 mb-3 text-slate-500">
                      <span>Live HTTP Stream</span>
                      <span className="flex items-center gap-1.5"><span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" /> Listening</span>
                    </div>
                    <div className="space-y-1.5 text-slate-300 text-left">
                      <div className="flex justify-between text-emerald-400"><span className="font-bold">[200 OK]</span><span>GET /api/users (Sliding Window - 23ms)</span></div>
                      <div className="flex justify-between text-emerald-400"><span className="font-bold">[200 OK]</span><span>GET /api/users (Sliding Window - 12ms)</span></div>
                      <div className="flex justify-between text-red-400"><span className="font-bold">[429 ERR]</span><span>GET /api/users (Rate Limit Exceeded - Retry: 8s)</span></div>
                      <div className="flex justify-between text-slate-505 text-slate-500"><span>[Pending]</span><span>Waiting for stress burst trigger...</span></div>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Core Features Grid */}
            <section className="bg-slate-900/30 border-y border-slate-900 py-24">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="text-center mb-16">
                  <h2 className="text-3xl font-extrabold text-white sm:text-4xl mb-4">
                    Built for Enterprise Performance
                  </h2>
                  <p className="text-slate-400 max-w-xl mx-auto">
                    A comprehensive set of robust algorithms designed to sit directly in front of your microservices with negligible performance costs.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                  {/* Algorithm: Token Bucket */}
                  <div className="bg-slate-950 border border-slate-800 hover:border-indigo-500/40 p-6 rounded-2xl transition-all duration-305 hover:-translate-y-1">
                    <div className="w-12 h-12 bg-indigo-950/40 border border-indigo-500/25 rounded-xl flex items-center justify-center mb-5 text-indigo-400">
                      <Layers className="w-6 h-6" />
                    </div>
                    <h3 className="text-lg font-bold text-white mb-2 text-left">Token Bucket</h3>
                    <p className="text-slate-400 text-sm leading-relaxed text-left">
                      Handles burst traffic efficiently. Refills a bucket of tokens at a constant rate, consuming tokens with each request. Powered by atomic Redis Lua scripts.
                    </p>
                  </div>

                  {/* Algorithm: Leaky Bucket */}
                  <div className="bg-slate-950 border border-slate-800 hover:border-emerald-500/40 p-6 rounded-2xl transition-all duration-305 hover:-translate-y-1">
                    <div className="w-12 h-12 bg-emerald-950/40 border border-emerald-500/25 rounded-xl flex items-center justify-center mb-5 text-emerald-400">
                      <Zap className="w-6 h-6" />
                    </div>
                    <h3 className="text-lg font-bold text-white mb-2 text-left">Leaky Bucket</h3>
                    <p className="text-slate-400 text-sm leading-relaxed text-left">
                      Polices flow rates perfectly. Processes requests in a queue at a strictly constant rate. Perfect for smoothing out heavy back-end database writing routines.
                    </p>
                  </div>

                  {/* Algorithm: Sliding Window */}
                  <div className="bg-slate-950 border border-slate-800 hover:border-indigo-500/40 p-6 rounded-2xl transition-all duration-305 hover:-translate-y-1">
                    <div className="w-12 h-12 bg-indigo-950/40 border border-indigo-500/25 rounded-xl flex items-center justify-center mb-5 text-indigo-400">
                      <Clock className="w-6 h-6" />
                    </div>
                    <h3 className="text-lg font-bold text-white mb-2 text-left">Sliding Window</h3>
                    <p className="text-slate-400 text-sm leading-relaxed text-left">
                      Provides mathematical precision. Computes rolling time spans to prevent threshold trickery at edge boundaries. The most balanced web rate-limiter.
                    </p>
                  </div>

                  {/* Algorithm: Fixed Window */}
                  <div className="bg-slate-950 border border-slate-800 hover:border-emerald-500/40 p-6 rounded-2xl transition-all duration-305 hover:-translate-y-1">
                    <div className="w-12 h-12 bg-emerald-950/40 border border-emerald-500/25 rounded-xl flex items-center justify-center mb-5 text-emerald-400">
                      <Layers className="w-6 h-6" />
                    </div>
                    <h3 className="text-lg font-bold text-white mb-2 text-left">Fixed Window</h3>
                    <p className="text-slate-400 text-sm leading-relaxed text-left">
                      Simple and ultra-high-speed. Resets bucket tallies at exact clock-aligned boundaries. Low complexity, low database overhead.
                    </p>
                  </div>
                </div>
              </div>
            </section>
          </div>
        ) : (
          /* ========================================================================= */
          /* DEVELOPER DASHBOARD                                                       */
          /* ========================================================================= */
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 transition-opacity duration-300">
            {/* Real-time Status Alert */}
            <div className="mb-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-4 rounded-xl">
              <div className="flex items-center gap-3">
                <span className={`w-2.5 h-2.5 rounded-full ${sseActive ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
                <div className="text-left">
                  <span className="text-sm font-semibold text-white">Live Telemetry Connection</span>
                  <p className="text-xs text-slate-400">
                    {sseActive ? 'SSE active and listening to Redis publishes.' : 'Telemetry offline. Check Redis connection.'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-400 font-mono">Current API Key:</span>
                <div className="bg-slate-950 border border-slate-800 px-3 py-1.5 rounded-lg flex items-center gap-2">
                  <span className="text-xs text-indigo-400 font-mono">{apiKey}</span>
                  <button onClick={copyToClipboard} className="text-slate-400 hover:text-white transition-colors cursor-pointer">
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            </div>

            {/* Top Grid: Settings & Visual Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
              
              {/* Card 1: Configuration Form */}
              <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl flex flex-col justify-between text-left">
                <div>
                  <div className="flex items-center gap-2 mb-4 text-indigo-400">
                    <Settings className="w-5 h-5" />
                    <h3 className="font-bold text-white text-lg">Configure Rate Limit</h3>
                  </div>
                  <p className="text-xs text-slate-400 mb-6">
                    Update the dynamic parameters below to immediately generate or update a policy key stored in Upstash Redis.
                  </p>

                  <form onSubmit={handleGenerateKey} className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">Workspace ID / Client ID</label>
                      <input 
                        type="text" 
                        value={clientId} 
                        onChange={(e) => setClientId(e.target.value)} 
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 transition-colors"
                        required
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1">Max Limit (Requests)</label>
                        <input 
                          type="number" 
                          value={limit} 
                          onChange={(e) => setLimit(e.target.value)} 
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 transition-colors"
                          required
                          min="1"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1">Window Size (Secs)</label>
                        <input 
                          type="number" 
                          value={windowSize} 
                          onChange={(e) => setWindowSize(e.target.value)} 
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 transition-colors"
                          required
                          min="1"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">Algorithm Strategy</label>
                      <select 
                        value={algorithm} 
                        onChange={(e) => setAlgorithm(e.target.value)} 
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 transition-colors"
                      >
                        <option value="sliding-window">Sliding Window (Rolling counts)</option>
                        <option value="fixed-window">Fixed Window (Interval aligned)</option>
                        <option value="token-bucket">Token Bucket (Lua atomic refill)</option>
                        <option value="leaky-bucket">Leaky Bucket (Constant processing)</option>
                      </select>
                    </div>

                    <button 
                      type="submit" 
                      disabled={generating}
                      className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-semibold transition-colors mt-2 cursor-pointer"
                    >
                      {generating ? 'Updating Redis...' : 'Generate New SaaS API Key'}
                    </button>
                  </form>
                </div>
                
                <div className="mt-6 pt-4 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
                  <span className="flex items-center gap-1"><Info className="w-3.5 h-3.5" /> Updates are instant</span>
                  <span>Active Key: {apiKey === 'rl_demo_default' ? 'Demo Sandbox' : 'Custom'}</span>
                </div>
              </div>

              {/* Card 2: Analytics Stats Panel */}
              <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl flex flex-col justify-between text-left">
                <div>
                  <div className="flex items-center gap-2 mb-4 text-emerald-400">
                    <BarChart3 className="w-5 h-5" />
                    <h3 className="font-bold text-white text-lg">Key Telemetry Metrics</h3>
                  </div>
                  <p className="text-xs text-slate-400 mb-6">
                    Tracks cumulative traffic distributions logged for the current active API key session.
                  </p>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-slate-950 border border-slate-800 p-4 rounded-xl">
                      <span className="text-xs text-slate-500 block">Total Hits</span>
                      <span className="text-2xl font-black text-slate-100 font-mono">{stats.total}</span>
                    </div>
                    <div className="bg-slate-950 border border-slate-800 p-4 rounded-xl">
                      <span className="text-xs text-emerald-500 block">Allowed Hits</span>
                      <span className="text-2xl font-black text-emerald-400 font-mono">{stats.allowed}</span>
                    </div>
                    <div className="bg-slate-950 border border-slate-800 p-4 rounded-xl">
                      <span className="text-xs text-red-500 block">Blocked Hits</span>
                      <span className="text-2xl font-black text-red-400 font-mono">{stats.blocked}</span>
                    </div>
                    <div className="bg-slate-950 border border-slate-800 p-4 rounded-xl">
                      <span className="text-xs text-amber-500 block">429 Failures</span>
                      <span className="text-2xl font-black text-amber-400 font-mono">{stats.errors429}</span>
                    </div>
                  </div>
                </div>
                
                <div className="mt-6 pt-4 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-500 font-mono">
                  <span>OVERHEAD: &lt; 2.5ms</span>
                  <span>REDIS DATACENTER: UPSTASH</span>
                </div>
              </div>

              {/* Card 3: Live Chart Panel */}
              <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl flex flex-col justify-between text-left">
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2 text-indigo-400">
                      <TrendingUp className="w-5 h-5" />
                      <h3 className="font-bold text-white text-lg">Usage Distributions</h3>
                    </div>
                    <span className="text-[10px] bg-slate-950 text-indigo-300 font-semibold px-2 py-0.5 rounded-md uppercase border border-slate-800">
                      ChartJS Live
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mb-6">
                    A visual breakdown of accepted requests vs rate limit blocks.
                  </p>

                  <div className="h-44 relative flex items-center justify-center">
                    {stats.total === 0 ? (
                      <div className="text-center text-xs text-slate-500">
                        <BarChart3 className="w-8 h-8 text-slate-700 mx-auto mb-2" />
                        No request metrics to chart yet.<br />Try a playground action below!
                      </div>
                    ) : (
                      <Bar data={chartData} options={chartOptions} />
                    )}
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-800 text-center text-[10px] text-slate-500">
                  Refreshed automatically via SSE event hook
                </div>
              </div>

            </div>

            {/* Middle Grid: Test Playground & Live Logs */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
              
              {/* Column 1: API Playground */}
              <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl flex flex-col justify-between text-left">
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2 text-indigo-400">
                      <Terminal className="w-5 h-5" />
                      <h3 className="font-bold text-white text-lg">Interactive Playground</h3>
                    </div>
                  </div>

                  <div className="space-y-4 mb-4">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-300 mb-1">Target API Proxy URL (Any Public JSON/Text endpoint)</label>
                      <input 
                        type="url" 
                        value={targetApiUrl} 
                        onChange={(e) => setTargetApiUrl(e.target.value)} 
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 transition-colors font-mono"
                        placeholder="https://api.external.com/data"
                      />
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-300 mb-1">Burst Count (Requests)</label>
                        <input 
                          type="number" 
                          value={burstCount} 
                          onChange={(e) => setBurstCount(e.target.value)} 
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 transition-colors font-mono"
                          min="1"
                          max="1000"
                        />
                      </div>
                      <div className="flex gap-2">
                        <button 
                          onClick={handleTestRequest}
                          disabled={testingSingle || testingStress}
                          className="grow py-2 bg-slate-950 hover:bg-slate-850 text-slate-300 border border-slate-800 hover:border-slate-700 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                        >
                          <Play className="w-3.5 h-3.5" />
                          Try 1 Req
                        </button>
                        <button 
                          onClick={handleStressTest}
                          disabled={testingSingle || testingStress}
                          className="grow py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-all shadow-md shadow-indigo-600/20 cursor-pointer disabled:opacity-50"
                        >
                          <Zap className="w-3.5 h-3.5" />
                          Send Burst
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Stress progress indicator */}
                  {testingStress && (
                    <div className="mb-4 bg-slate-950 border border-slate-800 p-3 rounded-lg text-xs">
                      <div className="flex justify-between font-mono text-[10px] mb-1">
                        <span>Firing Concurrent Batches...</span>
                        <span>{stressProgress}%</span>
                      </div>
                      <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                        <div className="bg-indigo-500 h-full transition-all duration-100" style={{ width: `${stressProgress}%` }} />
                      </div>
                    </div>
                  )}

                  {/* Terminal display for response */}
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 font-mono text-xs text-slate-300 min-h-[170px] flex flex-col justify-between">
                    <div>
                      <div className="flex justify-between items-center border-b border-slate-850 pb-2 mb-3 text-slate-500">
                        <span>Terminal Output</span>
                        <span>HTTP/1.1 Client</span>
                      </div>

                      {testResponse ? (
                        <div className="space-y-2 text-left">
                          <div>
                            <span className="text-slate-505 text-slate-550 text-slate-500">HTTP Status:</span>{' '}
                            <span className={testResponse.status === 200 ? 'text-emerald-400 font-bold' : 'text-red-400 font-bold'}>
                              {testResponse.status} {testResponse.statusText}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-505 text-slate-550 text-slate-500">Headers:</span>
                            <div className="pl-4 text-[11px] space-y-0.5 text-slate-400">
                              <div>X-RateLimit-Limit: {testResponse.headers['x-ratelimit-limit']}</div>
                              <div>X-RateLimit-Remaining: {testResponse.headers['x-ratelimit-remaining']}</div>
                              <div>X-RateLimit-Reset: {testResponse.headers['x-ratelimit-reset']}</div>
                              {testResponse.headers['retry-after'] && (
                                <div className="text-red-400 font-semibold">Retry-After: {testResponse.headers['retry-after']}s</div>
                              )}
                            </div>
                          </div>
                          <div>
                            <span className="text-slate-505 text-slate-550 text-slate-500">Response Body:</span>
                            <pre className="pl-4 text-slate-300 bg-slate-900/60 p-2 rounded border border-slate-800 mt-1 overflow-x-auto">
                              {JSON.stringify(testResponse.body, null, 2)}
                            </pre>
                          </div>
                        </div>
                      ) : (
                        <div className="text-slate-500 italic py-6 text-center">
                          Trigger "Try 1 Request" or "Send 500 requests" to view real-time HTTP response logs.
                        </div>
                      )}
                    </div>

                    {testResponse && (
                      <div className="mt-3 text-[10px] text-slate-500 flex justify-between border-t border-slate-800 pt-2">
                        <span>Latency: {testResponse.latency}</span>
                        <span>API Server: Active</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-800 text-slate-400 text-[10px]">
                  Fires to the rate-limited playground path: <code className="bg-slate-950 px-1 py-0.5 rounded text-indigo-400 font-mono">POST /api/test</code>
                </div>
              </div>

              {/* Column 2: Live Log Stream */}
              <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl flex flex-col justify-between text-left">
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2 text-indigo-400">
                      <Clock className="w-5 h-5" />
                      <h3 className="font-bold text-white text-lg">Real-Time Request Stream</h3>
                    </div>
                    <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-bold bg-emerald-950/30 border border-emerald-500/20 px-2 py-0.5 rounded">
                      <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping" />
                      Live Stream
                    </span>
                  </div>
                  <p className="text-xs text-slate-450 text-slate-400 mb-6">
                    A running terminal trace of the last 50 requests mapped to this client token.
                  </p>

                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 font-mono text-[11px] h-[190px] overflow-y-auto space-y-1.5 custom-scrollbar">
                    {logs.length === 0 ? (
                      <div className="text-slate-500 italic py-10 text-center text-xs">
                        No request logs recorded yet. Send a request to see the stream update.
                      </div>
                    ) : (
                      logs.map((log, index) => {
                        const date = new Date(log.timestamp);
                        const timeStr = date.toTimeString().split(' ')[0];
                        return (
                          <div key={index} className="flex items-center justify-between py-1 border-b border-slate-900/50">
                            <span className="text-slate-500">{timeStr}</span>
                            <span className="text-slate-300 font-medium">{log.method} {log.endpoint}</span>
                            <span className="text-indigo-400">{log.algorithm}</span>
                            <span className={`font-semibold ${log.allowed ? 'text-emerald-400' : 'text-red-400'}`}>
                              {log.allowed ? 'ALLOWED' : 'BLOCKED'}
                            </span>
                            <span className="text-slate-500 text-slate-400">rem: {log.remaining}</span>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-800 text-slate-400 text-[10px]">
                  Powered by local Node EventEmitter pushing Server-Sent Events (SSE).
                </div>
              </div>

            </div>

            {/* Middle Row: API Key Management Table */}
            {user && (
              <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl text-left mb-8 shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-500/5 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />
                
                <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-4">
                  <div className="flex items-center gap-2 text-indigo-400">
                    <Key className="w-5 h-5" />
                    <h3 className="font-bold text-white text-lg">My Managed API Keys</h3>
                  </div>
                  <span className="text-xs text-slate-500 bg-slate-950 border border-slate-850 px-3 py-1 rounded-full font-mono">
                    Total Keys: {userKeys.length}
                  </span>
                </div>

                {userKeys.length === 0 ? (
                  <div className="text-center py-10 bg-slate-950/40 rounded-xl border border-slate-850/50">
                    <Key className="w-8 h-8 text-slate-700 mx-auto mb-3" />
                    <h4 className="text-sm font-semibold text-slate-300">No active keys found</h4>
                    <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
                      Generate your first rate-limiting API key above to start securing your microservices.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-slate-800 text-slate-400 font-semibold">
                          <th className="pb-3 pt-1">Client Workspace ID</th>
                          <th className="pb-3 pt-1">Algorithm</th>
                          <th className="pb-3 pt-1">Rate Policy</th>
                          <th className="pb-3 pt-1">API Key</th>
                          <th className="pb-3 pt-1">Created At</th>
                          <th className="pb-3 pt-1 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-850/40">
                        {userKeys.map((k) => (
                          <tr key={k.apiKey} className={`hover:bg-slate-950/20 transition-colors ${apiKey === k.apiKey ? 'bg-indigo-950/10' : ''}`}>
                            <td className="py-3 font-semibold text-slate-200">{k.clientId}</td>
                            <td className="py-3">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold border uppercase ${
                                k.algorithm === 'token-bucket' ? 'bg-purple-950/40 text-purple-400 border-purple-800/30' :
                                k.algorithm === 'leaky-bucket' ? 'bg-blue-950/40 text-blue-400 border-blue-800/30' :
                                k.algorithm === 'sliding-window' ? 'bg-emerald-950/40 text-emerald-400 border-emerald-800/30' :
                                'bg-amber-950/40 text-amber-400 border-amber-800/30'
                              }`}>
                                {k.algorithm.replace('-', ' ')}
                              </span>
                            </td>
                            <td className="py-3 text-slate-300 font-medium">
                              {k.limit} req / {k.window}s
                            </td>
                            <td className="py-3 font-mono text-[11px]">
                              <div className="flex items-center gap-2">
                                <span className="text-slate-400 font-semibold">{k.apiKey.substring(0, 12)}...</span>
                                <button 
                                  onClick={() => {
                                    navigator.clipboard.writeText(k.apiKey);
                                    alert("API Key copied to clipboard!");
                                  }} 
                                  className="text-slate-500 hover:text-slate-300 p-0.5 transition-colors cursor-pointer"
                                  title="Copy Full Key"
                                >
                                  <Copy className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                            <td className="py-3 text-slate-500">
                              {new Date(k.createdAt).toLocaleDateString()}
                            </td>
                            <td className="py-3 text-right space-x-2">
                              <button
                                onClick={() => setApiKey(k.apiKey)}
                                className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                                  apiKey === k.apiKey
                                    ? 'bg-emerald-900/40 text-emerald-400 border border-emerald-500/20'
                                    : 'bg-slate-950 hover:bg-slate-850 text-slate-300 border border-slate-800'
                                }`}
                              >
                                {apiKey === k.apiKey ? 'Active' : 'Monitor'}
                              </button>
                              <button
                                onClick={() => handleRevokeKey(k.apiKey)}
                                className="px-2.5 py-1.5 bg-red-950/30 hover:bg-red-900/40 text-red-400 border border-red-900/20 rounded-lg text-[10px] font-bold transition-all cursor-pointer"
                              >
                                Revoke
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Bottom Section: Developer Documentation */}
            <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl text-left">
              <div className="flex items-center gap-2 mb-4 text-indigo-400">
                <Code className="w-5 h-5" />
                <h3 className="font-bold text-white text-lg">Developer Integrations & Setup</h3>
              </div>
              <p className="text-xs text-slate-400 mb-6">
                Integrate RateLimiterX directly in your microservices or edge routers using standard API key headers.
              </p>

              <div className="flex flex-col lg:flex-row gap-6">
                
                {/* Left tab buttons */}
                <div className="flex flex-row lg:flex-col gap-2 overflow-x-auto pb-2 lg:pb-0 lg:w-48 shrink-0 border-b lg:border-b-0 lg:border-r border-slate-800">
                  <button 
                    onClick={() => setDocLanguage('node')}
                    className={`px-4 py-2 text-left rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      docLanguage === 'node' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-800'
                    }`}
                  >
                    NodeJS (Fetch)
                  </button>
                  <button 
                    onClick={() => setDocLanguage('python')}
                    className={`px-4 py-2 text-left rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      docLanguage === 'python' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-800'
                    }`}
                  >
                    Python (Requests)
                  </button>
                  <button 
                    onClick={() => setDocLanguage('express')}
                    className={`px-4 py-2 text-left rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      docLanguage === 'express' ? 'bg-indigo-650 bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-850 hover:bg-slate-800'
                    }`}
                  >
                    Express Middleware
                  </button>
                  <button 
                    onClick={() => setDocLanguage('nextjs')}
                    className={`px-4 py-2 text-left rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      docLanguage === 'nextjs' ? 'bg-indigo-650 bg-indigo-600 text-white' : 'text-slate-450 text-slate-400 hover:bg-slate-850 hover:bg-slate-800'
                    }`}
                  >
                    NextJS Middleware
                  </button>
                  <button 
                    onClick={() => setDocLanguage('curl')}
                    className={`px-4 py-2 text-left rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      docLanguage === 'curl' ? 'bg-indigo-650 bg-indigo-600 text-white' : 'text-slate-450 text-slate-400 hover:bg-slate-850 hover:bg-slate-800'
                    }`}
                  >
                    cURL Command
                  </button>
                </div>

                {/* Right code box */}
                <div className="grow bg-slate-950 border border-slate-800 rounded-xl p-4 font-mono text-xs text-slate-300 relative">
                  <pre className="overflow-x-auto whitespace-pre">
                    {codeSnippets[docLanguage]}
                  </pre>
                  <button 
                    onClick={() => {
                      navigator.clipboard.writeText(codeSnippets[docLanguage]);
                      alert("Code snippet copied!");
                    }}
                    className="absolute top-4 right-4 p-2 bg-slate-900 border border-slate-800 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-all cursor-pointer"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>

              </div>
            </div>

          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 border-t border-slate-900 text-center text-slate-500 text-xs mt-12">
        <p>&copy; {new Date().getFullYear()} RateLimiterX Inc. All rights reserved.</p>
        <p className="mt-2 text-slate-650 text-slate-600">
          Built with React 19, Tailwind CSS v4, Upstash Redis, and Node.js.
        </p>
      </footer>
    </div>
  );
}
