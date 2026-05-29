use trident_fuzz::fuzzing::*;

#[derive(Default)]
#[allow(dead_code)]
pub struct AccountAddresses {
    pub creator: AddressStorage,
    pub mint: AddressStorage,
    pub stream: AddressStorage,
    pub vault: AddressStorage,
    pub creator_token_account: AddressStorage,
    pub recipient_token_account: AddressStorage,
    pub token_program: AddressStorage,
    pub recipient: AddressStorage,
    pub config: AddressStorage,
    pub system_program: AddressStorage,
    pub associated_token_program: AddressStorage,
    pub milestone: AddressStorage,
    pub admin: AddressStorage,
    pub recipient_ata: AddressStorage,
    pub fee_vault: AddressStorage,
    pub chainlink_feed: AddressStorage,
}
