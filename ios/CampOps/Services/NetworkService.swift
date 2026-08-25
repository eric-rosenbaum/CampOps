import Foundation

/// Hardened networking for every Supabase call the app makes.
///
/// **The problem this solves.** `URLSession.shared`what supabase-swift uses by default -
/// allows 60 seconds per request and never retries. A camp's wifi routinely leaves a TCP
/// socket half-dead: the connection looks alive to the client, the request goes out, and
/// nothing ever comes back. The user taps Save, watches a spinner for the better part of a
/// minute, and then sees a failure, or, if they tap again, a success, because the second tap
/// happens to get a fresh socket. That is exactly the "hangs then sometimes works" behaviour
/// reported across Pool, Assets and Issues.
///
/// The web app hit this first and fixed it with a 4-second-per-attempt fetch wrapper that
/// retries (see `src/lib/supabase.ts`). This is the iOS counterpart. Doing it as a
/// `URLProtocol` means it covers PostgREST, Auth and Storage in one place, rather than
/// wrapping 60-odd call sites in DataService and the view models.
///
/// **Why retrying writes is safe here.** Every insert carries a client-generated `UUID`, so a
/// retry that duplicates a request the server already applied collides on the primary key and
/// fails harmlessly instead of writing the row twice. The same reasoning is why the web client
/// retries writes.
final class RetryingURLProtocol: URLProtocol {
    /// Per attempt. Deliberately close to the web's 4s: long enough for a slow-but-live camp
    /// connection, short enough that a dead socket is abandoned before the user gives up.
    private static let attemptTimeout: TimeInterval = 6
    /// Waits before the 2nd and 3rd attempts. Total worst case ≈ 6 + 1 + 6 + 3 + 6 = 22s,
    /// versus 60s of silence today, and in practice attempt 2 succeeds on a fresh socket.
    private static let retryDelays: [TimeInterval] = [1, 3]

    private static let handledKey = "CampOpsRetryHandled"

    /// The session that actually performs the work. It must NOT carry this protocol class,
    /// or every attempt would recurse back into it.
    private static let inner: URLSession = {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = attemptTimeout
        config.timeoutIntervalForResource = 60
        // Fail fast instead of parking the request until connectivity returns; the retry
        // ladder above is a better answer for a flaky camp network than an invisible wait.
        config.waitsForConnectivity = false
        config.requestCachePolicy = .reloadIgnoringLocalCacheData
        return URLSession(configuration: config)
    }()

    private var currentTask: URLSessionDataTask?
    private var retryWorkItem: DispatchWorkItem?

    override class func canInit(with request: URLRequest) -> Bool {
        guard let scheme = request.url?.scheme?.lowercased(),
              scheme == "http" || scheme == "https" else { return false }
        return URLProtocol.property(forKey: handledKey, in: request) == nil
    }

    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        attempt(0)
    }

    override func stopLoading() {
        retryWorkItem?.cancel()
        retryWorkItem = nil
        currentTask?.cancel()
        currentTask = nil
    }

    private func attempt(_ index: Int) {
        guard let mutable = (request as NSURLRequest).mutableCopy() as? NSMutableURLRequest else {
            client?.urlProtocol(self, didFailWithError: URLError(.badURL))
            return
        }
        URLProtocol.setProperty(true, forKey: Self.handledKey, in: mutable)

        currentTask = Self.inner.dataTask(with: mutable as URLRequest) { [weak self] data, response, error in
            guard let self else { return }

            if let error {
                if self.shouldRetry(error: error, attempt: index) {
                    let delay = Self.retryDelays[index]
                    let work = DispatchWorkItem { [weak self] in self?.attempt(index + 1) }
                    self.retryWorkItem = work
                    DispatchQueue.global().asyncAfter(deadline: .now() + delay, execute: work)
                } else {
                    self.client?.urlProtocol(self, didFailWithError: error)
                }
                return
            }

            if let response {
                self.client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            }
            if let data {
                self.client?.urlProtocol(self, didLoad: data)
            }
            self.client?.urlProtocolDidFinishLoading(self)
        }
        currentTask?.resume()
    }

    private func shouldRetry(error: Error, attempt index: Int) -> Bool {
        guard index < Self.retryDelays.count else { return false }

        // A streamed body can't be replayed, so an upload gets the shorter timeout but only
        // one attempt. Everything PostgREST sends uses an in-memory body and is replayable.
        if request.httpBodyStream != nil { return false }

        guard let urlError = error as? URLError else { return false }
        switch urlError.code {
        case .timedOut, .networkConnectionLost, .cannotConnectToHost,
             .cannotFindHost, .dnsLookupFailed, .resourceUnavailable:
            return true
        case .cancelled:
            return false // the caller gave up; respect that
        default:
            return false
        }
    }
}

enum NetworkService {
    /// The session handed to `SupabaseClient`. Requests made through it inherit the timeout
    /// and retry behaviour above.
    static let session: URLSession = {
        let config = URLSessionConfiguration.default
        config.protocolClasses = [RetryingURLProtocol.self] + (config.protocolClasses ?? [])
        // An outer ceiling in case a retry ladder runs long; each attempt has its own.
        config.timeoutIntervalForRequest = 30
        config.timeoutIntervalForResource = 90
        config.waitsForConnectivity = false
        return URLSession(configuration: config)
    }()
}
