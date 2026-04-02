type EnvVarOptions = {
  required?: boolean;
};

export function getEnvVar(name: string, options: EnvVarOptions = {}): string | undefined {
  const value = process.env[name];
  const required = options.required ?? true;

  if (required && (value === undefined || value === '')) {
    throw new Error(`${name} environment variable is not set`);
  }

  return value;
}

export function getRequiredEnvVar(name: string): string {
  const value = getEnvVar(name, { required: true });
  // getEnvVar will throw if missing, so non-null assertion is safe here
  return value!;
}

