import React from 'react'

export default function App(): React.ReactElement {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto py-6 px-4">
          <h1 className="text-3xl font-bold text-gray-900">
            Planning Poker
          </h1>
          <p className="text-gray-600 mt-2">
            Remote estimation for distributed teams
          </p>
        </div>
      </header>

      <main className="max-w-7xl mx-auto py-12 px-4">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            Welcome
          </h2>
          <p className="text-gray-700 mb-6">
            Planning Poker is a web application that enables distributed software teams 
            to run estimation sessions remotely with real-time collaboration.
          </p>
          
          <div className="grid md:grid-cols-3 gap-6 mt-8">
            <div className="p-6 border border-gray-200 rounded-lg">
              <h3 className="font-semibold text-lg mb-2">Real-time Sync</h3>
              <p className="text-gray-600">
                Peer-to-peer synchronization with CRDT technology ensures all participants 
                see the same data.
              </p>
            </div>
            
            <div className="p-6 border border-gray-200 rounded-lg">
              <h3 className="font-semibold text-lg mb-2">Anonymous Voting</h3>
              <p className="text-gray-600">
                Hide votes until reveal time to reduce anchoring bias and encourage 
                independent thinking.
              </p>
            </div>
            
            <div className="p-6 border border-gray-200 rounded-lg">
              <h3 className="font-semibold text-lg mb-2">No Setup Required</h3>
              <p className="text-gray-600">
                Create a room and share a link—no accounts, no backend required. 
                Everything works in your browser.
              </p>
            </div>
          </div>

          <div className="mt-8">
            <button className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg transition">
              Create a Room
            </button>
          </div>
        </div>
      </main>
    </div>
  )
}
