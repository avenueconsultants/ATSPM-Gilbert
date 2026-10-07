namespace Utah.Udot.Atspm.Exceptions;

/// <summary>
/// An expected report failure with a caller-facing message and HTTP error status.
/// Uses the common ATSPM exception hierarchy so report controllers can handle failures
/// without depending on a particular measure or device implementation.
/// </summary>
public sealed class ReportException : AtspmException
{
    /// <summary>Creates a report failure, optionally preserving its underlying cause for logging.</summary>
    /// <param name="statusCode">HTTP error status from 400 through 599.</param>
    /// <param name="message">Explanation suitable for returning to the report caller.</param>
    /// <param name="innerException">Optional underlying exception.</param>
    public ReportException(int statusCode, string message, Exception innerException = null)
        : base(message, innerException)
    {
        if (statusCode < 400 || statusCode > 599)
            throw new ArgumentOutOfRangeException(nameof(statusCode), "A report failure requires an HTTP error status.");
        StatusCode = statusCode;
    }

    /// <summary>HTTP error status returned by the report controller.</summary>
    public int StatusCode { get; }
}
