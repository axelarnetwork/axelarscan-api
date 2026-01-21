const {
  SecretsManagerClient,
  GetSecretValueCommand,
} = require('@aws-sdk/client-secrets-manager');
const { log } = require('./logger');

/**
 * SecretsManager class to retrieve secrets from AWS Secrets Manager
 * Handles caching internally to avoid repeated API calls within the same Lambda execution
 */
class SecretsManager {
  constructor() {
    // Cache for secrets (per Lambda execution context)
    this.cache = {};
    // Track in-flight requests to prevent duplicate API calls
    this.pending = {};
  }

  /**
   * Retrieve a secret from AWS Secrets Manager
   * @param {string} secretArn - ARN of the secret in AWS Secrets Manager
   * @returns {Promise<string|object>} The secret value (parsed JSON if applicable, otherwise string)
   */
  async getSecret(secretArn) {
    if (!secretArn) {
      return null;
    }

    // Return cached value if available
    if (this.cache[secretArn]) {
      return this.cache[secretArn];
    }

    // If there's already a request in flight for this secret, wait for it
    if (this.pending[secretArn]) {
      return this.pending[secretArn];
    }

    // Create a new request and store the promise
    const requestPromise = (async () => {
      try {
        const client = new SecretsManagerClient({
          region: process.env.AWS_REGION || 'us-east-2',
        });
        const command = new GetSecretValueCommand({ SecretId: secretArn });
        const response = await client.send(command);

        // Handle both string and JSON secrets
        let secretValue;
        if (response.SecretString) {
          try {
            // Try to parse as JSON (for structured secrets)
            secretValue = JSON.parse(response.SecretString);
          } catch {
            // If not JSON, use as plain string
            secretValue = response.SecretString;
          }
        } else if (response.SecretBinary) {
          // Convert binary secret to string
          secretValue = Buffer.from(response.SecretBinary).toString('utf-8');
        } else {
          throw new Error('Secret has no value');
        }

        // Cache the secret for this execution context
        this.cache[secretArn] = secretValue;

        return secretValue;
      } catch (error) {
        log(
          'error',
          'secrets',
          'Failed to retrieve secret from Secrets Manager',
          {
            secretArn,
            error: error.message,
          }
        );
        throw error;
      } finally {
        // Remove from pending requests once done (success or failure)
        delete this.pending[secretArn];
      }
    })();

    // Store the promise so concurrent requests can wait for it
    this.pending[secretArn] = requestPromise;

    return requestPromise;
  }

  /**
   * Get indexer configuration from environment variables or Secrets Manager
   * If INDEXER_SECRET_ARN is set, retrieves from Secrets Manager (must be a JSON object)
   * Otherwise falls back to environment variables (local development)
   * The secret must be a JSON object with: { url, username, password }
   * @returns {Promise<{url: string, username: string, password: string}>} The indexer configuration
   */
  async getIndexerConfig() {
    const secretArn = process.env.INDEXER_SECRET_ARN;

    // If secret ARN is provided, retrieve from Secrets Manager
    if (secretArn) {
      const secret = await this.getSecret(secretArn);

      // Secret must be a JSON object with url, username, and password
      if (typeof secret !== 'object' || secret === null) {
        log(
          'error',
          'secrets',
          'Indexer secret must be a JSON object with url, username, and password',
          { secretArn }
        );
        throw new Error(
          'Indexer secret must be a JSON object with url, username, and password'
        );
      }

      return {
        url: secret.url || secret.INDEXER_URL,
        username: secret.username || secret.INDEXER_USERNAME,
        password: secret.password || secret.INDEXER_PASSWORD,
      };
    }

    // Fallback to environment variables (local development)
    return {
      url: process.env.INDEXER_URL,
      username: process.env.INDEXER_USERNAME,
      password: process.env.INDEXER_PASSWORD,
    };
  }
}

// Create a singleton instance
const secretsManager = new SecretsManager();

// Export the instance and class for flexibility
module.exports = {
  SecretsManager,
  secretsManager,
  // Convenience methods that use the singleton
  getSecret: secretArn => secretsManager.getSecret(secretArn),
  getIndexerConfig: () => secretsManager.getIndexerConfig(),
};
