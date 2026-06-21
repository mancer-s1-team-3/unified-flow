/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/unified_flow.json`.
 */
export type UnifiedFlow = {
  "address": "8M5yieUh7pxwUi1YBByDF82nqoorZwaKi8dBoMVpurFa",
  "metadata": {
    "name": "unifiedFlow",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Created with Anchor"
  },
  "instructions": [
    {
      "name": "cancel",
      "discriminator": [
        232,
        219,
        223,
        41,
        219,
        236,
        220,
        190
      ],
      "accounts": [
        {
          "name": "creator",
          "writable": true,
          "signer": true
        },
        {
          "name": "mint",
          "relations": [
            "stream"
          ]
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "stream",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  114,
                  101,
                  97,
                  109
                ]
              },
              {
                "kind": "account",
                "path": "stream.creator",
                "account": "streamAccount"
              },
              {
                "kind": "account",
                "path": "stream.recipient",
                "account": "streamAccount"
              },
              {
                "kind": "account",
                "path": "stream.nonce",
                "account": "streamAccount"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "stream"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "creatorTokenAccount",
          "writable": true
        },
        {
          "name": "recipientTokenAccount",
          "writable": true
        },
        {
          "name": "tokenProgram"
        }
      ],
      "args": []
    },
    {
      "name": "createStream",
      "discriminator": [
        71,
        188,
        111,
        127,
        108,
        40,
        229,
        158
      ],
      "accounts": [
        {
          "name": "creator",
          "writable": true,
          "signer": true
        },
        {
          "name": "recipient"
        },
        {
          "name": "mint"
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "stream",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  114,
                  101,
                  97,
                  109
                ]
              },
              {
                "kind": "account",
                "path": "creator"
              },
              {
                "kind": "account",
                "path": "recipient"
              },
              {
                "kind": "arg",
                "path": "nonce"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "stream"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "creatorTokenAccount",
          "writable": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        },
        {
          "name": "startTs",
          "type": "i64"
        },
        {
          "name": "cliffTs",
          "type": "i64"
        },
        {
          "name": "endTs",
          "type": "i64"
        },
        {
          "name": "vestingType",
          "type": "u8"
        },
        {
          "name": "milestones",
          "type": {
            "vec": {
              "defined": {
                "name": "milestoneInput"
              }
            }
          }
        },
        {
          "name": "nonce",
          "type": "u64"
        }
      ]
    },
    {
      "name": "editCliff",
      "discriminator": [
        41,
        203,
        122,
        7,
        21,
        225,
        162,
        98
      ],
      "accounts": [
        {
          "name": "creator",
          "writable": true,
          "signer": true,
          "relations": [
            "stream"
          ]
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "stream",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  114,
                  101,
                  97,
                  109
                ]
              },
              {
                "kind": "account",
                "path": "stream.creator",
                "account": "streamAccount"
              },
              {
                "kind": "account",
                "path": "stream.recipient",
                "account": "streamAccount"
              },
              {
                "kind": "account",
                "path": "stream.nonce",
                "account": "streamAccount"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "newCliffTs",
          "type": "i64"
        }
      ]
    },
    {
      "name": "editLinear",
      "discriminator": [
        255,
        42,
        53,
        36,
        79,
        96,
        83,
        223
      ],
      "accounts": [
        {
          "name": "creator",
          "writable": true,
          "signer": true,
          "relations": [
            "stream"
          ]
        },
        {
          "name": "mint",
          "relations": [
            "stream"
          ]
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "stream",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  114,
                  101,
                  97,
                  109
                ]
              },
              {
                "kind": "account",
                "path": "stream.creator",
                "account": "streamAccount"
              },
              {
                "kind": "account",
                "path": "stream.recipient",
                "account": "streamAccount"
              },
              {
                "kind": "account",
                "path": "stream.nonce",
                "account": "streamAccount"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "stream"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "creatorTokenAccount",
          "writable": true
        },
        {
          "name": "tokenProgram"
        }
      ],
      "args": [
        {
          "name": "newEndTs",
          "type": "i64"
        },
        {
          "name": "topupAmount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "editMilestone",
      "discriminator": [
        123,
        218,
        165,
        226,
        209,
        227,
        8,
        166
      ],
      "accounts": [
        {
          "name": "creator",
          "writable": true,
          "signer": true,
          "relations": [
            "stream"
          ]
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "stream",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  114,
                  101,
                  97,
                  109
                ]
              },
              {
                "kind": "account",
                "path": "stream.creator",
                "account": "streamAccount"
              },
              {
                "kind": "account",
                "path": "stream.recipient",
                "account": "streamAccount"
              },
              {
                "kind": "account",
                "path": "stream.nonce",
                "account": "streamAccount"
              }
            ]
          }
        },
        {
          "name": "milestone",
          "writable": true
        },
        {
          "name": "mint",
          "relations": [
            "stream"
          ]
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "stream"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "creatorTokenAccount",
          "writable": true
        },
        {
          "name": "tokenProgram"
        }
      ],
      "args": [
        {
          "name": "newAmount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "initializeConfig",
      "discriminator": [
        208,
        127,
        21,
        1,
        194,
        190,
        196,
        70
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "setPause",
      "discriminator": [
        63,
        32,
        154,
        2,
        56,
        103,
        79,
        45
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "paused",
          "type": "bool"
        }
      ]
    },
    {
      "name": "unlockMilestone",
      "discriminator": [
        131,
        196,
        6,
        134,
        153,
        130,
        248,
        238
      ],
      "accounts": [
        {
          "name": "creator",
          "writable": true,
          "signer": true,
          "relations": [
            "stream"
          ]
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "stream",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  114,
                  101,
                  97,
                  109
                ]
              },
              {
                "kind": "account",
                "path": "stream.creator",
                "account": "streamAccount"
              },
              {
                "kind": "account",
                "path": "stream.recipient",
                "account": "streamAccount"
              },
              {
                "kind": "account",
                "path": "stream.nonce",
                "account": "streamAccount"
              }
            ]
          }
        },
        {
          "name": "milestone",
          "writable": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "withdraw",
      "discriminator": [
        183,
        18,
        70,
        156,
        148,
        109,
        161,
        34
      ],
      "accounts": [
        {
          "name": "recipient",
          "writable": true,
          "signer": true
        },
        {
          "name": "mint",
          "relations": [
            "stream"
          ]
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "stream",
          "docs": [
            "Stream account"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  114,
                  101,
                  97,
                  109
                ]
              },
              {
                "kind": "account",
                "path": "stream.creator",
                "account": "streamAccount"
              },
              {
                "kind": "account",
                "path": "stream.recipient",
                "account": "streamAccount"
              },
              {
                "kind": "account",
                "path": "stream.nonce",
                "account": "streamAccount"
              }
            ]
          }
        },
        {
          "name": "vault",
          "docs": [
            "Vault token account (ATA owned by stream PDA)"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "stream"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "recipientAta",
          "docs": [
            "Token account recipient"
          ],
          "writable": true
        },
        {
          "name": "feeVault",
          "docs": [
            "Recipient fee SOL"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  102,
                  101,
                  101,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "chainlinkFeed"
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "withdrawFees",
      "discriminator": [
        198,
        212,
        171,
        109,
        144,
        215,
        174,
        89
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "feeVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  102,
                  101,
                  101,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "destination",
          "writable": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "configAccount",
      "discriminator": [
        189,
        255,
        97,
        70,
        186,
        189,
        24,
        102
      ]
    },
    {
      "name": "milestoneAccount",
      "discriminator": [
        21,
        222,
        32,
        140,
        43,
        166,
        109,
        19
      ]
    },
    {
      "name": "streamAccount",
      "discriminator": [
        243,
        60,
        164,
        106,
        199,
        192,
        110,
        53
      ]
    }
  ],
  "events": [
    {
      "name": "cliffEdited",
      "discriminator": [
        143,
        207,
        9,
        136,
        149,
        157,
        201,
        139
      ]
    },
    {
      "name": "feesWithdrawn",
      "discriminator": [
        234,
        15,
        0,
        119,
        148,
        241,
        40,
        21
      ]
    },
    {
      "name": "linearEdited",
      "discriminator": [
        94,
        168,
        133,
        235,
        122,
        111,
        156,
        155
      ]
    },
    {
      "name": "milestoneEdited",
      "discriminator": [
        178,
        220,
        80,
        222,
        55,
        97,
        104,
        50
      ]
    },
    {
      "name": "milestoneUnlocked",
      "discriminator": [
        234,
        55,
        24,
        33,
        42,
        152,
        104,
        241
      ]
    },
    {
      "name": "protocolPaused",
      "discriminator": [
        35,
        111,
        245,
        138,
        237,
        199,
        79,
        223
      ]
    },
    {
      "name": "streamCancelled",
      "discriminator": [
        91,
        215,
        29,
        237,
        194,
        6,
        184,
        92
      ]
    },
    {
      "name": "streamCreated",
      "discriminator": [
        93,
        150,
        91,
        15,
        166,
        8,
        251,
        166
      ]
    },
    {
      "name": "tokensClaimed",
      "discriminator": [
        25,
        128,
        244,
        55,
        241,
        136,
        200,
        91
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "invalidAmount",
      "msg": "Amount must be greater than zero"
    },
    {
      "code": 6001,
      "name": "invalidSchedule",
      "msg": "End date must be after start date"
    },
    {
      "code": 6002,
      "name": "invalidCliff",
      "msg": "Cliff date must be between start and end dates"
    },
    {
      "code": 6003,
      "name": "invalidEndDate",
      "msg": "End date must be in the future"
    },
    {
      "code": 6004,
      "name": "invalidStartDate",
      "msg": "Start date must not be in the past"
    },
    {
      "code": 6005,
      "name": "durationTooShort",
      "msg": "Stream duration too short"
    },
    {
      "code": 6006,
      "name": "mathOverflow",
      "msg": "Math overflow"
    },
    {
      "code": 6007,
      "name": "invalidRecipient",
      "msg": "Invalid recipient"
    },
    {
      "code": 6008,
      "name": "invalidMint",
      "msg": "Invalid mint"
    },
    {
      "code": 6009,
      "name": "invalidTokenOwner",
      "msg": "Invalid token owner"
    },
    {
      "code": 6010,
      "name": "insufficientBalance",
      "msg": "Insufficient balance"
    },
    {
      "code": 6011,
      "name": "mintNotAllowed",
      "msg": "Mint not allowed"
    },
    {
      "code": 6012,
      "name": "protocolPaused",
      "msg": "Protocol paused"
    },
    {
      "code": 6013,
      "name": "amountTooSmall",
      "msg": "Amount too small"
    },
    {
      "code": 6014,
      "name": "invalidMintDecimals",
      "msg": "Invalid mint decimals"
    },
    {
      "code": 6015,
      "name": "transferFeeMintUnsupported",
      "msg": "Transfer fee tokens unsupported"
    },
    {
      "code": 6016,
      "name": "streamNotActive",
      "msg": "Stream not active"
    },
    {
      "code": 6017,
      "name": "streamNotCancelable",
      "msg": "Stream not cancelable"
    },
    {
      "code": 6018,
      "name": "nothingToWithdraw",
      "msg": "No tokens available to withdraw"
    },
    {
      "code": 6019,
      "name": "unauthorized",
      "msg": "Signer is not the stream recipient"
    },
    {
      "code": 6020,
      "name": "invalidOracleFeed",
      "msg": "Invalid oracle price feed"
    },
    {
      "code": 6021,
      "name": "staleOraclePrice",
      "msg": "Oracle price is stale (> 1 hour)"
    },
    {
      "code": 6022,
      "name": "invalidOraclePrice",
      "msg": "Oracle returned invalid price"
    },
    {
      "code": 6023,
      "name": "invalidFeeReceiver",
      "msg": "Invalid fee receiver account"
    },
    {
      "code": 6024,
      "name": "alreadyCancelled",
      "msg": "Already cancelled"
    },
    {
      "code": 6025,
      "name": "fullyVested",
      "msg": "Fully vested"
    },
    {
      "code": 6026,
      "name": "streamExpired",
      "msg": "Stream expired"
    },
    {
      "code": 6027,
      "name": "milestoneAlreadyUnlocked",
      "msg": "Milestone already unlocked"
    },
    {
      "code": 6028,
      "name": "invalidVestingType",
      "msg": "Invalid vesting type"
    },
    {
      "code": 6029,
      "name": "invalidMilestoneCount",
      "msg": "Invalid milestone count"
    },
    {
      "code": 6030,
      "name": "invalidMilestonePda",
      "msg": "Invalid milestone PDA"
    },
    {
      "code": 6031,
      "name": "invalidMilestoneAmount",
      "msg": "Invalid milestone amount"
    },
    {
      "code": 6032,
      "name": "previousMilestoneNotApproved",
      "msg": "Previous milestone not approved"
    },
    {
      "code": 6033,
      "name": "invalidMilestoneOrder",
      "msg": "Invalid milestone order"
    },
    {
      "code": 6034,
      "name": "previousMilestoneMissing",
      "msg": "Previous milestone missing"
    },
    {
      "code": 6035,
      "name": "streamAlreadyStarted",
      "msg": "Stream already started and cannot be modified"
    }
  ],
  "types": [
    {
      "name": "cliffEdited",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "stream",
            "type": "pubkey"
          },
          {
            "name": "oldCliffTs",
            "type": "i64"
          },
          {
            "name": "newCliffTs",
            "type": "i64"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "configAccount",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "adminAuthority",
            "type": "pubkey"
          },
          {
            "name": "feeAuthority",
            "type": "pubkey"
          },
          {
            "name": "paused",
            "type": "bool"
          },
          {
            "name": "withdrawFeeBps",
            "type": "u16"
          },
          {
            "name": "maxWithdrawFeeBps",
            "type": "u16"
          },
          {
            "name": "feeChangeTimelockSeconds",
            "type": "u64"
          },
          {
            "name": "pendingFees",
            "type": {
              "option": {
                "defined": {
                  "name": "pendingFees"
                }
              }
            }
          },
          {
            "name": "allowedMints",
            "type": {
              "vec": "pubkey"
            }
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "feesWithdrawn",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "admin",
            "type": "pubkey"
          },
          {
            "name": "destination",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "linearEdited",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "stream",
            "type": "pubkey"
          },
          {
            "name": "oldEndTs",
            "type": "i64"
          },
          {
            "name": "newEndTs",
            "type": "i64"
          },
          {
            "name": "oldTotalAmount",
            "type": "u64"
          },
          {
            "name": "newTotalAmount",
            "type": "u64"
          },
          {
            "name": "topupAmount",
            "type": "u64"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "milestoneAccount",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "stream",
            "type": "pubkey"
          },
          {
            "name": "index",
            "type": "u8"
          },
          {
            "name": "unlockTs",
            "type": "i64"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "approved",
            "type": "bool"
          },
          {
            "name": "unlocked",
            "type": "bool"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "milestoneEdited",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "stream",
            "type": "pubkey"
          },
          {
            "name": "milestone",
            "type": "pubkey"
          },
          {
            "name": "index",
            "type": "u8"
          },
          {
            "name": "oldAmount",
            "type": "u64"
          },
          {
            "name": "newAmount",
            "type": "u64"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "milestoneInput",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "milestoneUnlocked",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "stream",
            "type": "pubkey"
          },
          {
            "name": "milestone",
            "type": "pubkey"
          },
          {
            "name": "index",
            "type": "u8"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "unlockTs",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "pendingFees",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "newWithdrawFeeBps",
            "type": "u16"
          },
          {
            "name": "effectiveAt",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "protocolPaused",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "admin",
            "type": "pubkey"
          },
          {
            "name": "timestamp",
            "type": "i64"
          },
          {
            "name": "paused",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "streamAccount",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "creator",
            "type": "pubkey"
          },
          {
            "name": "recipient",
            "type": "pubkey"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "vault",
            "type": "pubkey"
          },
          {
            "name": "totalAmount",
            "type": "u64"
          },
          {
            "name": "withdrawn",
            "type": "u64"
          },
          {
            "name": "startTs",
            "type": "i64"
          },
          {
            "name": "cliffTs",
            "type": "i64"
          },
          {
            "name": "endTs",
            "type": "i64"
          },
          {
            "name": "vestingType",
            "type": "u8"
          },
          {
            "name": "status",
            "type": "u8"
          },
          {
            "name": "cancelable",
            "type": "bool"
          },
          {
            "name": "milestoneCount",
            "type": "u8"
          },
          {
            "name": "nextMilestoneIndex",
            "type": "u8"
          },
          {
            "name": "cancelled",
            "type": "bool"
          },
          {
            "name": "nonce",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "unlockedMilestoneAmount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "streamCancelled",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "stream",
            "type": "pubkey"
          },
          {
            "name": "creator",
            "type": "pubkey"
          },
          {
            "name": "recipient",
            "type": "pubkey"
          },
          {
            "name": "vestedAmount",
            "type": "u64"
          },
          {
            "name": "returnedToCreator",
            "type": "u64"
          },
          {
            "name": "claimableForRecipient",
            "type": "u64"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "streamCreated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "stream",
            "type": "pubkey"
          },
          {
            "name": "creator",
            "type": "pubkey"
          },
          {
            "name": "recipient",
            "type": "pubkey"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "vault",
            "type": "pubkey"
          },
          {
            "name": "totalAmount",
            "type": "u64"
          },
          {
            "name": "vestingType",
            "type": "u8"
          },
          {
            "name": "startTs",
            "type": "i64"
          },
          {
            "name": "cliffTs",
            "type": "i64"
          },
          {
            "name": "endTs",
            "type": "i64"
          },
          {
            "name": "milestoneCount",
            "type": "u8"
          },
          {
            "name": "cancelable",
            "type": "bool"
          },
          {
            "name": "nonce",
            "type": "u64"
          },
          {
            "name": "createdAt",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "tokensClaimed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "stream",
            "type": "pubkey"
          },
          {
            "name": "recipient",
            "type": "pubkey"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "claimable",
            "type": "u64"
          },
          {
            "name": "feeLamports",
            "type": "u64"
          },
          {
            "name": "withdrawnTotal",
            "type": "u64"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    }
  ]
};
