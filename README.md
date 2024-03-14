# Axelarscan API

## API Endpoints
- mainnet: [https://api.axelarscan.io/api](https://api.axelarscan.io/api)
- testnet: [https://testnet.api.axelarscan.io/api](https://testnet.api.axelarscan.io/api)

## Deployment
### Prerequisites
1. [Install AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-prereqs.html)
2. [Configuring the AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/cli-chap-configure.html)
3. [Install terraform](https://learn.hashicorp.com/tutorials/terraform/install-cli)

```bash
yarn
cd ./terraform/testnet
terraform init
terraform apply
```