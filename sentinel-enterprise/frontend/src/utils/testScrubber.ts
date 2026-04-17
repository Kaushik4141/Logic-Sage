import { scrubSensitiveData } from './zeroLeak';

const testString = `
  Here is the error log:
  Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
  AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
  const dbPassword = "mySuperSecretPassword123!";
`;

console.log("CLEANED OUTPUT:\n", scrubSensitiveData(testString));