import hre from 'hardhat';
import { expect } from 'chai';

const { ethers, artifacts, getNamedAccounts } = hre;

describe('MintSwapNFTMarketplaceV1', () => {
    let marketplace: any;
    let marketplaceContract: any;
    let nft: any;
    let nft1155: any;
    let weth: any;
    let mmc: any;
    let seller: any;
    let buyer: any;
    let feeRecipient: any;
    let deployer: any;
    let deployerSigner: any;
    let sellerSigner: any;
    let buyerSigner: any;

    before(async () => {
        ({
            deployer,
            seller,
            buyer
        } = await getNamedAccounts());

        console.log("\n");
        deployerSigner = await ethers.provider.getSigner(deployer);
        sellerSigner = await ethers.provider.getSigner(seller);
        buyerSigner = await ethers.provider.getSigner(buyer);
        console.log("deployer address is ", await deployerSigner.getAddress());
        console.log("seller address is ", await sellerSigner.getAddress());
        console.log("buyer address is ", await buyerSigner.getAddress());

        console.log("\n");

        feeRecipient = await deployerSigner.getAddress();

        const MockWETH = await ethers.getContractFactory('WETH9');
        weth = await MockWETH.deploy();
        await weth.waitForDeployment();
        console.log("WETH9 deployed to:", await weth.getAddress());

        const MintMock = await ethers.getContractFactory('MintMock');
        mmc = await MintMock.deploy();
        await mmc.waitForDeployment();
        console.log("MintMock deployed to:", await mmc.getAddress());

        const ERC721Mock = await ethers.getContractFactory('ERC721Mock');
        nft = await ERC721Mock.deploy("ERC721Mock", "EM721", 10000, 1712900674);
        await nft.waitForDeployment();
        console.log("ERC721Mock deployed to:", await nft.getAddress());

        const ERC1155Mock = await ethers.getContractFactory('ERC1155Mock');
        nft1155 = await ERC1155Mock.deploy("ERC1155Mock", "EM1155");
        await nft1155.waitForDeployment();
        console.log("ERC1155Mock deployed to:", await nft1155.getAddress());

        const fee = 500; // 5%
        const MintSwapNFTMarketplaceV1 = await ethers.getContractFactory("MintSwapNFTMarketplaceV1");
        marketplace = await upgrades.deployProxy(
            MintSwapNFTMarketplaceV1 as any, 
            [
                fee, 
                feeRecipient
            ],
            {
                initializer: "initialize",
            }
        );
        await marketplace.waitForDeployment();
        console.log("MintSwapNFTMarketplaceV1 deployed to:", await marketplace.getAddress());

        await (await marketplace.setWeth(await weth.getAddress())).wait();
        await (await marketplace.toggleAreBidsActive()).wait();

        console.log("\n");
    });

    describe('init', () => {
        it('initialize()', async () => {
            await expect(marketplace.initialize(100, feeRecipient)).to.be.revertedWith(
                'Initializable: contract is already initialized',
            );
        });

        it('setSupportPaymentToken()', async () => {
            await marketplace.setSupportPaymentToken(await weth.getAddress(), true);
            expect(await marketplace.supportPaymentToken(await weth.getAddress())).to.equal(true);
        });

        it('setFee()', async () => {
            expect(await marketplace.fee()).to.be.equal(500);
            const newFee = 1000;
            const newFeeWithCollectionOwner = 750;

            await expect(
                marketplace.connect(sellerSigner).setFee(newFee, newFeeWithCollectionOwner),
            ).to.be.revertedWith(
                'AccessControl: account 0x70997970c51812dc3a010c7d01b50e0d17dc79c8 is missing role 0x4e9617a5e2ee64b49ea666eb545a00a6f26df1c8ca519835eb93aac8d7889492',
            );

            const tooHighFee = (await marketplace.MAX_FEE()) + 1n;

            await expect(marketplace.setFee(tooHighFee, newFeeWithCollectionOwner)).to.be.revertedWith(
                'Max fee',
            );

            await marketplace.setFee(newFee, newFeeWithCollectionOwner);
            expect(await marketplace.fee()).to.be.equal(newFee);
            expect(await marketplace.feeWithCollectionOwner()).to.be.equal(newFeeWithCollectionOwner);
        });

        it('setFeeRecipient()', async () => {
            expect(await marketplace.feeReceipient()).to.be.equal(feeRecipient);
            const newRecipient = seller;

            await expect(marketplace.connect(sellerSigner).setFeeRecipient(newRecipient)).to.be.revertedWith(
                'AccessControl: account 0x70997970c51812dc3a010c7d01b50e0d17dc79c8 is missing role 0x4e9617a5e2ee64b49ea666eb545a00a6f26df1c8ca519835eb93aac8d7889492',
            );
            await expect(marketplace.setFeeRecipient(ethers.ZeroAddress)).to.be.revertedWith(
                'Cannot set 0x0 address',
            );

            await marketplace.setFeeRecipient(newRecipient);
            expect(await marketplace.feeReceipient()).to.be.equal(newRecipient);

            // reset
            await marketplace.setFeeRecipient(deployer);
        });

        it('setCollectionOwnerFee()', async () => {
            expect(await marketplace.feeReceipient()).to.be.equal(feeRecipient);

            const collectionOwnerFee = {
                recipient: seller,
                fee: 500,
            };

            await expect(
                marketplace.connect(sellerSigner).setCollectionOwnerFee(await nft.getAddress(), collectionOwnerFee),
            ).to.be.revertedWith(
                'No permission',
            );

            await (await marketplace.setCollectionOwnerFee(await nft.getAddress(), collectionOwnerFee)).wait();

            expect((await marketplace.collectionToCollectionOwnerFee(await nft.getAddress())).recipient).to.be.equal(seller);
            expect((await marketplace.collectionToCollectionOwnerFee(await nft.getAddress())).fee).to.be.equal(500);

            // reset
            collectionOwnerFee.recipient = feeRecipient;
            await (await marketplace.setCollectionOwnerFee(await nft.getAddress(), collectionOwnerFee)).wait();
        });

        it('pause() & unpause()', async () => {
            expect(await marketplace.paused()).to.equal(false);
            await marketplace.pause();
            expect(await marketplace.paused()).to.equal(true);
            await marketplace.unpause();
            expect(await marketplace.paused()).to.equal(false);
        });
    });

    describe('ERC721', () => {
        it('createOrUpdateListing()', async () => {

            const totalMintPrice = ethers.parseUnits('0.05', 'ether');
            await nft.connect(sellerSigner).mint(5, { value: totalMintPrice });
            await nft.connect(sellerSigner).setApprovalForAll(await marketplace.getAddress(), true);
            
            const pricePerItem = ethers.parseUnits('0.01', 'ether');
            const expirationTime = 1744446500;

            // current block
            const blockNumber = await ethers.provider.getBlockNumber();
            const blockTime = (await ethers.provider.getBlock(blockNumber))?.timestamp ?? 0;

            const ListingsToCreate = {
                INVALID_MIN_PRICE: {
                    _tokenId: 0,
                    _nftAddress: await nft.getAddress(),
                    _quantity: 1,
                    _pricePerItem: 0,
                    _expirationTime: expirationTime,
                    _paymentToken: ethers.ZeroAddress,
                },
                INVALID_OVERFLOW_PRICE: {
                    _tokenId: 0,
                    _nftAddress: await nft.getAddress(),
                    _quantity: 1,
                    _pricePerItem: 999999999n,
                    _expirationTime: expirationTime,
                    _paymentToken: ethers.ZeroAddress,
                },
                INVALID_QUANTITY: {
                    _tokenId: 0,
                    _nftAddress: await nft.getAddress(),
                    _quantity: 0,
                    _pricePerItem: pricePerItem,
                    _expirationTime: expirationTime,
                    _paymentToken: ethers.ZeroAddress,
                },
                INVALID_PAYMENT_TOKEN: {
                    _tokenId: 0,
                    _nftAddress: await nft.getAddress(),
                    _quantity: 1,
                    _pricePerItem: pricePerItem,
                    _expirationTime: expirationTime,
                    _paymentToken: await nft.getAddress(),
                },
                INVALID_EXPIRATION: {
                    _tokenId: 0,
                    _nftAddress: await nft.getAddress(),
                    _quantity: 1,
                    _pricePerItem: pricePerItem,
                    _expirationTime: blockTime - 100,
                    _paymentToken: ethers.ZeroAddress,
                },
                VALID_1: {
                    _tokenId: 1,
                    _nftAddress: await nft.getAddress(),
                    _quantity: 1,
                    _pricePerItem: pricePerItem,
                    _expirationTime: expirationTime,
                    _paymentToken: await weth.getAddress(),
                },
                VALID_2: {
                    _tokenId: 2,
                    _nftAddress: await nft.getAddress(),
                    _quantity: 1,
                    _pricePerItem: pricePerItem,
                    _expirationTime: expirationTime,
                    _paymentToken: await weth.getAddress(),
                },
                VALID_3: {
                    _tokenId: 3,
                    _nftAddress: await nft.getAddress(),
                    _quantity: 1,
                    _pricePerItem: pricePerItem,
                    _expirationTime: expirationTime,
                    _paymentToken: await weth.getAddress(),
                },
                VALID_4: {
                    _tokenId: 4,
                    _nftAddress: await nft.getAddress(),
                    _quantity: 1,
                    _pricePerItem: pricePerItem,
                    _expirationTime: expirationTime,
                    _paymentToken: await weth.getAddress(),
                },
            };
            
            await expect(
                marketplace
                .connect(sellerSigner)
                .createOrUpdateListing([ListingsToCreate.INVALID_MIN_PRICE]),
            ).to.be.revertedWith('Below min price');

            await expect(
                marketplace
                    .connect(sellerSigner)
                    .createOrUpdateListing([ListingsToCreate.INVALID_OVERFLOW_PRICE]),
            ).to.be.revertedWith('Below min price');

            await expect(
                marketplace
                .connect(sellerSigner)
                .createOrUpdateListing([ListingsToCreate.INVALID_QUANTITY]),
            ).to.be.revertedWith('Cannot list multiple ERC721');

            await expect(
                marketplace
                .connect(sellerSigner)
                .createOrUpdateListing([ListingsToCreate.INVALID_PAYMENT_TOKEN]),
            ).to.be.revertedWith('Token is not supported');

            await expect(
                marketplace
                .connect(sellerSigner)
                .createOrUpdateListing([ListingsToCreate.INVALID_EXPIRATION]),
            ).to.be.revertedWith('Invalid expiration time');

            await expect(
                marketplace.connect(buyerSigner).createOrUpdateListing([ListingsToCreate.VALID_1]),
            ).to.be.revertedWith('Not owning item');

            await marketplace.pause();
            await expect(
                marketplace.connect(sellerSigner).createOrUpdateListing([ListingsToCreate.VALID_1]),
            ).to.be.revertedWith('Pausable: paused');
            await marketplace.unpause();

            await marketplace.connect(sellerSigner).createOrUpdateListing([ListingsToCreate.VALID_1]);

            const createdListings = [ListingsToCreate.VALID_2, ListingsToCreate.VALID_3];
            await Promise.all(
                createdListings.map(async (createdListing) => {
                    const listing = await marketplace.listings(
                        await nft.getAddress(),
                        ListingsToCreate.VALID_1._tokenId,
                        seller,
                    );
                    // console.log('------> ' + listing.quantity + ', ' + listing.pricePerItem + ', ' + listing.expirationTime)
                    expect(listing.quantity).to.be.equal(createdListing._quantity);
                    expect(listing.pricePerItem).to.be.equal(createdListing._pricePerItem);
                    expect(listing.expirationTime).to.be.equal(createdListing._expirationTime);
                }),
            );

            const ListingsToUpdate = {
                INCREASE_PRICE: {
                    ...ListingsToCreate.VALID_1,
                    _pricePerItem: ListingsToCreate.VALID_1._pricePerItem + 100n,
                },
                CHANGE_EXPIRATION: {
                    ...ListingsToCreate.VALID_1,
                    _expirationTime: ListingsToCreate.VALID_1._expirationTime + 100,
                },
                CHANGE_EXPIRATION_2: {
                    ...ListingsToCreate.VALID_2,
                    _expirationTime: ListingsToCreate.VALID_2._expirationTime + 100,
                },
                CHANGE_EXPIRATION_3: {
                    ...ListingsToCreate.VALID_3,
                    _expirationTime: ListingsToCreate.VALID_2._expirationTime + 100,
                },
                INVALID_MIN_PRICE: {
                    ...ListingsToCreate.VALID_1,
                    _pricePerItem: 0n,
                },
                INVALID_QUANTITY: {
                    ...ListingsToCreate.VALID_1,
                    _quantity: 0,
                },
            };

            await marketplace.pause();
            await expect(
                marketplace.connect(sellerSigner).createOrUpdateListing([ListingsToUpdate.INCREASE_PRICE]),
            ).to.be.revertedWith('Pausable: paused');
            await marketplace.unpause();

            await marketplace.connect(sellerSigner).createOrUpdateListing([ListingsToUpdate.INCREASE_PRICE]);

            const listing = await marketplace.listings(
                await nft.getAddress(),
                ListingsToUpdate.INCREASE_PRICE._tokenId,
                seller,
            );
            // console.log(listing.pricePerItem)
            expect(ListingsToUpdate.INCREASE_PRICE._pricePerItem).to.be.equal(listing.pricePerItem);

            await marketplace
                .connect(sellerSigner)
                .createOrUpdateListing([ListingsToCreate.VALID_4, ListingsToUpdate.CHANGE_EXPIRATION]);

            await marketplace
                .connect(sellerSigner)
                .createOrUpdateListing([ListingsToUpdate.CHANGE_EXPIRATION_2, ListingsToUpdate.CHANGE_EXPIRATION_3]);
                
            await Promise.all(
                [
                    ListingsToCreate.VALID_4,
                    ListingsToUpdate.CHANGE_EXPIRATION,
                    ListingsToUpdate.CHANGE_EXPIRATION_2,
                    ListingsToUpdate.CHANGE_EXPIRATION_3,
                ].map(async (expectedListing) => {
                    const actualListing = await marketplace.listings(
                        await nft.getAddress(),
                        expectedListing._tokenId,
                        seller,
                    );
                    expect(actualListing.quantity).to.be.equal(expectedListing._quantity);
                    expect(actualListing.pricePerItem).to.be.equal(expectedListing._pricePerItem);
                    expect(actualListing.expirationTime).to.be.equal(expectedListing._expirationTime);
                }),
            );

            await expect(
                marketplace
                    .connect(sellerSigner)
                    .createOrUpdateListing([ListingsToUpdate.INCREASE_PRICE, ListingsToUpdate.INVALID_MIN_PRICE]),
            ).to.be.revertedWith('Below min price');

            await expect(
                marketplace
                    .connect(sellerSigner)
                    .createOrUpdateListing([ListingsToUpdate.INCREASE_PRICE, ListingsToUpdate.INVALID_QUANTITY]),
            ).to.be.revertedWith('Cannot list multiple ERC721');
        });

        it('cancelListing()', async () => {

            const pricePerItem = ethers.parseUnits('0.01', 'ether');
            const expirationTime = 1744446500;

            const ListingsToCreate = {
                VALID_1: {
                    _tokenId: 1,
                    _nftAddress: await nft.getAddress(),
                    _quantity: 1,
                    _pricePerItem: pricePerItem,
                    _expirationTime: expirationTime,
                    _paymentToken: await weth.getAddress(),
                },
                VALID_2: {
                    _tokenId: 2,
                    _nftAddress: await nft.getAddress(),
                },
                VALID_3: {
                    _tokenId: 3,
                    _nftAddress: await nft.getAddress(),
                },
                VALID_4: {
                    _tokenId: 4,
                    _nftAddress: await nft.getAddress(),
                },
                VALID_5: {
                    _tokenId: 5,
                    _nftAddress: await nft.getAddress(),
                },
            };

            // all list
            const createdListings = [ListingsToCreate.VALID_1, ListingsToCreate.VALID_2, ListingsToCreate.VALID_3, ListingsToCreate.VALID_4];
            await Promise.all(
                createdListings.map(async (createdListing) => {
                    const listing = await marketplace.listings(
                        createdListing._nftAddress,
                        createdListing._tokenId,
                        seller,
                    );
                    // console.log('------> ' + createdListing._tokenId + ', ' + listing.quantity + ', ' + listing.pricePerItem + ', ' + listing.expirationTime)
                    expect(listing.quantity).to.be.equal(1);
                }),
            );

            const ListingsToDelete = {
                VALID_1: {
                    tokenId: 1,
                    nftAddress: await nft.getAddress(),
                },
                INVALID_1: {
                    tokenId: 0,
                    nftAddress: await nft.getAddress(),
                }
            }

            const unExistingListing = await marketplace.listings(
                ListingsToDelete.INVALID_1.nftAddress,
                ListingsToDelete.INVALID_1.tokenId,
                seller,
            );
            expect(unExistingListing.quantity).to.be.equal(0);

            await marketplace
                .connect(buyerSigner)
                .cancelListing([ListingsToDelete.VALID_1]);
            const invalidDeleteListing = await marketplace.listings(
                ListingsToDelete.VALID_1.nftAddress,
                ListingsToDelete.VALID_1.tokenId,
                buyer,
            );
            expect(invalidDeleteListing.quantity).to.be.equal(0);

            await marketplace
                .connect(sellerSigner)
                .cancelListing([ListingsToDelete.VALID_1]);

            const deleteListing = await marketplace.listings(
                ListingsToDelete.VALID_1.nftAddress,
                ListingsToDelete.VALID_1.tokenId,
                seller,
            );
            expect(deleteListing.quantity).to.be.equal(0);

            // reset 
            await marketplace.connect(sellerSigner).createOrUpdateListing([ListingsToCreate.VALID_1]);
        });

        it('buyItems()', async () => {

            const pricePerItem = ethers.parseEther("0.01");
            
            const ListingsToBuy = {
                VALID_1: {
                    tokenId: 1,
                    nftAddress: await nft.getAddress(),
                    owner: seller,
                    quantity: 1,
                    maxPricePerItem: pricePerItem, 
                    paymentToken: await weth.getAddress(),
                    usingEth: false
                },
                INVALID_1: {
                    tokenId: 1,
                    nftAddress: await nft.getAddress(),
                    owner: buyer,
                    quantity: 1,
                    maxPricePerItem: pricePerItem, 
                    paymentToken: ethers.ZeroAddress,
                    usingEth: false
                },
                INVALID_2: {
                    tokenId: 1,
                    nftAddress: await nft.getAddress(),
                    owner: buyer,
                    quantity: 1,
                    maxPricePerItem: pricePerItem, 
                    paymentToken: ethers.ZeroAddress,
                    usingEth: false
                },
                INVALID_3: {
                    tokenId: 0,
                    nftAddress: await nft.getAddress(),
                    owner: seller,
                    quantity: 0,
                    maxPricePerItem: pricePerItem, 
                    paymentToken: ethers.ZeroAddress,
                    usingEth: false
                },
                INVALID_4: {
                    tokenId: 1,
                    nftAddress: await nft.getAddress(),
                    owner: seller,
                    quantity: 2,
                    maxPricePerItem: pricePerItem, 
                    paymentToken: ethers.ZeroAddress,
                    usingEth: false
                },
            }

            await marketplace.pause();
            await expect(
                 marketplace.connect(buyerSigner).buyItems([ListingsToBuy.VALID_1], { value: ListingsToBuy.VALID_1.maxPricePerItem}),
            ).to.be.revertedWith('Pausable: paused');
            await marketplace.unpause();

            await expect(
                marketplace.connect(buyerSigner).buyItems([ListingsToBuy.INVALID_2], { value: ListingsToBuy.INVALID_2.maxPricePerItem}),
            ).to.be.revertedWith('Cannot buy your own item');

            await expect(
                marketplace.connect(buyerSigner).buyItems([ListingsToBuy.INVALID_3], { value: ListingsToBuy.INVALID_3.maxPricePerItem}),
            ).to.be.revertedWith('Nothing to buy');

            await expect(
                marketplace.connect(buyerSigner).buyItems([ListingsToBuy.INVALID_4], { value: ListingsToBuy.INVALID_4.maxPricePerItem}),
            ).to.be.revertedWith('not enough quantity');

            // const listing = await marketplace.listings(ListingsToBuy.VALID_1.nftAddress, ListingsToBuy.VALID_1.tokenId, ListingsToBuy.VALID_1.owner);
            // console.log(listing);

            await (await weth.connect(buyerSigner).deposit({ value: pricePerItem })).wait();
            await (await weth.connect(buyerSigner).approve(await marketplace.getAddress(), pricePerItem)).wait();
            expect(await weth.balanceOf(buyer)).to.eq(pricePerItem);

            expect(await nft.ownerOf(ListingsToBuy.VALID_1.tokenId)).to.equal(seller);

            await marketplace.connect(buyerSigner).buyItems([ListingsToBuy.VALID_1]);

            expect(await nft.ownerOf(ListingsToBuy.VALID_1.tokenId)).to.equal(buyer);
            expect(await weth.balanceOf(buyer)).to.eq(0);
            
            // reset
            const expirationTime = 1744446500;
            const ListingsToCreate = {
                VALID_1: {
                    _tokenId: 1,
                    _nftAddress: await nft.getAddress(),
                    _quantity: 1,
                    _pricePerItem: pricePerItem,
                    _expirationTime: expirationTime,
                    _paymentToken: await weth.getAddress(),
                }
            }

            await expect (
                marketplace.connect(buyerSigner).createOrUpdateListing([ListingsToCreate.VALID_1]),
            ).to.be.revertedWith('Item not approved');

            await nft.connect(buyerSigner).setApprovalForAll(await marketplace.getAddress(), true);

            await marketplace.connect(buyerSigner).createOrUpdateListing([ListingsToCreate.VALID_1]);

            await (await weth.connect(sellerSigner).deposit({ value: pricePerItem })).wait();
            await (await weth.connect(sellerSigner).approve(await marketplace.getAddress(), pricePerItem)).wait();
            expect(await weth.balanceOf(seller)).to.gte(pricePerItem);

            ListingsToBuy.VALID_1.owner = buyer;
            await marketplace.connect(sellerSigner).buyItems([ListingsToBuy.VALID_1]);

            expect(await nft.ownerOf(ListingsToBuy.VALID_1.tokenId)).to.equal(seller);
        });

        it('createOrUpdateTokenBid()', async () => {

            const expirationTime = 1744446500;
            const pricePerItem = ethers.parseEther("0.0999");

            const ListingsToBid = {
                VALID_1: {
                    _tokenId: 1,
                    _nftAddress: await nft.getAddress(),
                    _quantity: 1,
                    _pricePerItem: pricePerItem,
                    _expirationTime: expirationTime,
                    _paymentToken: await weth.getAddress(),
                }
            }

            await expect (
                marketplace.connect(buyerSigner).createOrUpdateTokenBid(
                    ListingsToBid.VALID_1._nftAddress,
                    ListingsToBid.VALID_1._tokenId,
                    ListingsToBid.VALID_1._quantity,
                    ListingsToBid.VALID_1._pricePerItem,
                    ListingsToBid.VALID_1._expirationTime,
                    ListingsToBid.VALID_1._paymentToken,
            )).to.be.revertedWith("Bidding is not active");

            await (await marketplace.toggleAreBidsActive()).wait();

            await expect (
                marketplace.connect(buyerSigner).createOrUpdateTokenBid(
                    ListingsToBid.VALID_1._nftAddress,
                    ListingsToBid.VALID_1._tokenId,
                    ListingsToBid.VALID_1._quantity,
                    ListingsToBid.VALID_1._pricePerItem,
                    ListingsToBid.VALID_1._expirationTime,
                    mmc,
            )).to.be.revertedWith("Token is not supported");

            await expect (
                marketplace.connect(buyerSigner).createOrUpdateTokenBid(
                    ListingsToBid.VALID_1._nftAddress,
                    ListingsToBid.VALID_1._tokenId,
                    ListingsToBid.VALID_1._quantity,
                    ListingsToBid.VALID_1._pricePerItem,
                    ListingsToBid.VALID_1._expirationTime,
                    ListingsToBid.VALID_1._paymentToken,
            )).to.be.revertedWith("Not enough tokens owned or allowed for bid");

            await (await weth.connect(buyerSigner).deposit({ value: pricePerItem })).wait();
            await (await weth.connect(buyerSigner).approve(await marketplace.getAddress(), pricePerItem)).wait();
            expect(await weth.balanceOf(buyer)).to.gte(pricePerItem);

            await expect ( 
                marketplace.connect(buyerSigner).createOrUpdateTokenBid(
                ListingsToBid.VALID_1._nftAddress,
                ListingsToBid.VALID_1._tokenId,
                0,
                ListingsToBid.VALID_1._pricePerItem,
                ListingsToBid.VALID_1._expirationTime,
                ListingsToBid.VALID_1._paymentToken,
            )).to.be.revertedWith("Token bid quantity 1 for ERC721");

            await expect ( 
                marketplace.connect(buyerSigner).createOrUpdateTokenBid(
                ListingsToBid.VALID_1._nftAddress,
                ListingsToBid.VALID_1._tokenId,
                ListingsToBid.VALID_1._quantity,
                ListingsToBid.VALID_1._pricePerItem,
                ListingsToBid.VALID_1._expirationTime - expirationTime,
                ListingsToBid.VALID_1._paymentToken,
            )).to.be.revertedWith("Invalid expiration time");

            await marketplace.connect(buyerSigner).createOrUpdateTokenBid(
                ListingsToBid.VALID_1._nftAddress,
                ListingsToBid.VALID_1._tokenId,
                ListingsToBid.VALID_1._quantity,
                ListingsToBid.VALID_1._pricePerItem,
                ListingsToBid.VALID_1._expirationTime,
                ListingsToBid.VALID_1._paymentToken,
            );

            const tokenBids = await marketplace.tokenBids(ListingsToBid.VALID_1._nftAddress, ListingsToBid.VALID_1._tokenId, buyer);
            expect(tokenBids.pricePerItem).to.be.eq(pricePerItem);

            // update 
            const newPricePerItem = ethers.parseEther("0.0911");
            ListingsToBid.VALID_1._pricePerItem = newPricePerItem;
            await marketplace.connect(buyerSigner).createOrUpdateTokenBid(
                ListingsToBid.VALID_1._nftAddress,
                ListingsToBid.VALID_1._tokenId,
                ListingsToBid.VALID_1._quantity,
                ListingsToBid.VALID_1._pricePerItem,
                ListingsToBid.VALID_1._expirationTime,
                ListingsToBid.VALID_1._paymentToken,
            );
            const updateTokenBids = await marketplace.tokenBids(ListingsToBid.VALID_1._nftAddress, ListingsToBid.VALID_1._tokenId, buyer);
            expect(updateTokenBids.pricePerItem).to.be.eq(newPricePerItem);

        });

        it('cancelBids()', async () => {

            const expirationTime = 1744446500;
            const pricePerItem = ethers.parseEther("0.0999");

            const ListingsToBid = {
                VALID_1: {
                    _tokenId: 1,
                    _nftAddress: await nft.getAddress(),
                    _quantity: 1,
                    _pricePerItem: pricePerItem,
                    _expirationTime: expirationTime,
                    _paymentToken: await weth.getAddress(),
                }
            }

            await marketplace.connect(buyerSigner).cancelBids([
                {
                    bidType: 0,
                    nftAddress: ListingsToBid.VALID_1._nftAddress,
                    tokenId: ListingsToBid.VALID_1._tokenId
                }
            ]);

            const tokenBids = await marketplace.connect(buyerSigner).tokenBids(ListingsToBid.VALID_1._nftAddress, ListingsToBid.VALID_1._tokenId, buyer);
            expect(tokenBids.quantity).to.be.eq(0);

            // reset
            await marketplace.connect(buyerSigner).createOrUpdateTokenBid(
                ListingsToBid.VALID_1._nftAddress,
                ListingsToBid.VALID_1._tokenId,
                ListingsToBid.VALID_1._quantity,
                ListingsToBid.VALID_1._pricePerItem,
                ListingsToBid.VALID_1._expirationTime,
                ListingsToBid.VALID_1._paymentToken,
            );
            const resetTokenBids = await marketplace.connect(buyerSigner).tokenBids(ListingsToBid.VALID_1._nftAddress, ListingsToBid.VALID_1._tokenId, buyer);
            expect(resetTokenBids.quantity).to.be.eq(1);
        });

        it('acceptTokenBid()', async () => {

            const pricePerItem = ethers.parseEther("0.0999");

            const ListingsToTakeBid = {
                INVALID_1: {
                    nftAddress: await nft.getAddress(),
                    tokenId: 0,
                    bidder: buyer,
                    quantity: 1,
                    pricePerItem: pricePerItem,
                    paymentToken: await weth.getAddress(),
                },
                INVALID_2: {
                    nftAddress: await nft.getAddress(),
                    tokenId: 1,
                    bidder: seller,
                    quantity: 1,
                    pricePerItem: pricePerItem,
                    paymentToken: await weth.getAddress(),
                },
                INVALID_3: {
                    nftAddress: await nft.getAddress(),
                    tokenId: 1,
                    bidder: buyer,
                    quantity: 2,
                    pricePerItem: pricePerItem,
                    paymentToken: await weth.getAddress(),
                },
                INVALID_4: {
                    nftAddress: await nft.getAddress(),
                    tokenId: 1,
                    bidder: buyer,
                    quantity: 1,
                    pricePerItem: pricePerItem - ethers.parseEther("0.001"),
                    paymentToken: await weth.getAddress(),
                },
                INVALID_5: {
                    nftAddress: await nft.getAddress(),
                    tokenId: 1,
                    bidder: buyer,
                    quantity: 1,
                    pricePerItem: pricePerItem,
                    paymentToken: await mmc.getAddress(),
                },
                VALID_1: {
                    nftAddress: await nft.getAddress(),
                    tokenId: 1,
                    bidder: buyer,
                    quantity: 1,
                    pricePerItem: pricePerItem,
                    paymentToken: await weth.getAddress(),
                }
            }

            await marketplace.pause();
            await expect (
                marketplace.connect(sellerSigner).acceptTokenBid(ListingsToTakeBid.INVALID_1),
            ).to.be.revertedWith("Pausable: paused");
            await marketplace.unpause();

            await marketplace.toggleAreBidsActive();

            await expect (
                marketplace.connect(sellerSigner).acceptTokenBid(ListingsToTakeBid.INVALID_1),
            ).to.be.revertedWith("Bidding is not active");

            await marketplace.toggleAreBidsActive();

            await expect (
                marketplace.connect(sellerSigner).acceptTokenBid(ListingsToTakeBid.INVALID_1),
            ).to.be.revertedWith("Bid does not exist");

            await expect (
                marketplace.connect(sellerSigner).acceptTokenBid(ListingsToTakeBid.INVALID_2),
            ).to.be.revertedWith("Cannot supply own bid");

            await expect (
                marketplace.connect(sellerSigner).acceptTokenBid(ListingsToTakeBid.INVALID_3),
            ).to.be.revertedWith("Not enough quantity");

            await expect (
                marketplace.connect(sellerSigner).acceptTokenBid(ListingsToTakeBid.INVALID_4),
            ).to.be.revertedWith("Price does not match");

            await expect (
                marketplace.connect(sellerSigner).acceptTokenBid(ListingsToTakeBid.INVALID_5),
            ).to.be.revertedWith("Wrong payment token");
        
            await expect (
                marketplace.connect(buyerSigner).acceptTokenBid(ListingsToTakeBid.VALID_1),
            ).to.be.revertedWith("Cannot supply own bid");

            await marketplace.connect(sellerSigner).acceptTokenBid(ListingsToTakeBid.VALID_1);

            expect(await nft.ownerOf(ListingsToTakeBid.VALID_1.tokenId)).to.equal(buyer);

            // reset
            await nft.connect(buyerSigner).safeTransferFrom(buyer, seller, ListingsToTakeBid.VALID_1.tokenId);
            expect(await nft.ownerOf(ListingsToTakeBid.VALID_1.tokenId)).to.equal(seller);

        });

        it('createOrUpdateCollectionBid()', async () => {

            const expirationTime = 1744446500;
            const pricePerItem = ethers.parseEther("0.0999");

            const ListingsToCollectionBid = {
                VALID_1: {
                    _nftAddress: await nft.getAddress(),
                    _quantity: 1,
                    _pricePerItem: pricePerItem,
                    _expirationTime: expirationTime,
                    _paymentToken: await weth.getAddress(),
                }
            }

            await expect (
                marketplace.connect(sellerSigner).createOrUpdateCollectionBid(
                ListingsToCollectionBid.VALID_1._nftAddress,
                ListingsToCollectionBid.VALID_1._quantity,
                ListingsToCollectionBid.VALID_1._pricePerItem,
                ListingsToCollectionBid.VALID_1._expirationTime,
                ListingsToCollectionBid.VALID_1._paymentToken,),
            ).to.be.revertedWith("Not enough tokens owned or allowed for bid")

            await expect (
                marketplace.connect(buyerSigner).createOrUpdateCollectionBid(
                ListingsToCollectionBid.VALID_1._nftAddress,
                0,
                ListingsToCollectionBid.VALID_1._pricePerItem,
                ListingsToCollectionBid.VALID_1._expirationTime,
                ListingsToCollectionBid.VALID_1._paymentToken,),
            ).to.be.revertedWith("Bad quantity")

            await expect (
                marketplace.connect(buyerSigner).createOrUpdateCollectionBid(
                ListingsToCollectionBid.VALID_1._nftAddress,
                ListingsToCollectionBid.VALID_1._quantity,
                0,
                ListingsToCollectionBid.VALID_1._expirationTime,
                ListingsToCollectionBid.VALID_1._paymentToken,),
            ).to.be.revertedWith("Below min price")

            await expect (
                marketplace.connect(buyerSigner).createOrUpdateCollectionBid(
                ListingsToCollectionBid.VALID_1._nftAddress,
                ListingsToCollectionBid.VALID_1._quantity,
                ListingsToCollectionBid.VALID_1._pricePerItem,
                0,
                ListingsToCollectionBid.VALID_1._paymentToken,),
            ).to.be.revertedWith("Invalid expiration time")

            await expect (
                marketplace.connect(buyerSigner).createOrUpdateCollectionBid(
                ListingsToCollectionBid.VALID_1._nftAddress,
                ListingsToCollectionBid.VALID_1._quantity,
                ListingsToCollectionBid.VALID_1._pricePerItem,
                ListingsToCollectionBid.VALID_1._expirationTime,
                await mmc.getAddress()),
            ).to.be.revertedWith("Token is not supported")

            await (await weth.connect(buyerSigner).deposit({ value: pricePerItem })).wait();
            await (await weth.connect(buyerSigner).approve(await marketplace.getAddress(), pricePerItem)).wait();

            await marketplace.connect(buyerSigner).createOrUpdateCollectionBid(
                ListingsToCollectionBid.VALID_1._nftAddress,
                ListingsToCollectionBid.VALID_1._quantity,
                ListingsToCollectionBid.VALID_1._pricePerItem,
                ListingsToCollectionBid.VALID_1._expirationTime,
                ListingsToCollectionBid.VALID_1._paymentToken
            );

            const collectionBids = await marketplace.collectionBids(ListingsToCollectionBid.VALID_1._nftAddress, buyer);
            expect(collectionBids.quantity).to.be.eq(ListingsToCollectionBid.VALID_1._quantity);
        });

        it('acceptCollectionBid()', async () => {

            const pricePerItem = ethers.parseEther("0.0999");

            const ListingsToTakeBid = {
                VALID_1: {
                    nftAddress: await nft.getAddress(),
                    tokenId: 1,
                    bidder: buyer,
                    quantity: 1,
                    pricePerItem: pricePerItem,
                    paymentToken: await weth.getAddress(),
                }
            }

            await marketplace.connect(sellerSigner).acceptCollectionBid([ListingsToTakeBid.VALID_1]);

            expect(await nft.ownerOf(ListingsToTakeBid.VALID_1.tokenId)).to.equal(buyer);

            // reset
            await nft.connect(buyerSigner).safeTransferFrom(buyer, seller, ListingsToTakeBid.VALID_1.tokenId);
            expect(await nft.ownerOf(ListingsToTakeBid.VALID_1.tokenId)).to.equal(seller);

        });
    });

    describe('ERC1155', () => {
        it('createOrUpdateListing()', async () => {

            const amount = 100;
            await nft1155.connect(sellerSigner).mint(seller, 1, amount);
            expect (await nft1155.balanceOf(seller, 1)).to.be.eq(amount);

            const expirationTime = 1744446500;
            const pricePerItem = ethers.parseEther("0.001");

            const ListingsToCreate = {
                VALID_1: {
                    _tokenId: 1,
                    _nftAddress: await nft1155.getAddress(),
                    _quantity: 1,
                    _pricePerItem: pricePerItem,
                    _expirationTime: expirationTime,
                    _paymentToken: await weth.getAddress(),
                },
            };
            
            await nft1155.connect(sellerSigner).setApprovalForAll(await marketplace.getAddress(), true);

            ListingsToCreate.VALID_1._quantity = 101;
            await expect (
                marketplace.connect(sellerSigner).createOrUpdateListing([ListingsToCreate.VALID_1])
            ).to.be.revertedWith('Must hold enough nfts');
            ListingsToCreate.VALID_1._quantity = 10;
            
            await marketplace.connect(sellerSigner).createOrUpdateListing([ListingsToCreate.VALID_1]);
            const createdListings = [ListingsToCreate.VALID_1];
            await Promise.all(
                createdListings.map(async (createdListing) => {
                    const listing = await marketplace.listings(
                        await nft1155.getAddress(),
                        ListingsToCreate.VALID_1._tokenId,
                        seller,
                    );
                    // console.log('------> ' + listing.quantity + ', ' + listing.pricePerItem + ', ' + listing.expirationTime)
                    expect(listing.quantity).to.be.equal(createdListing._quantity);
                    expect(listing.pricePerItem).to.be.equal(createdListing._pricePerItem);
                    expect(listing.expirationTime).to.be.equal(createdListing._expirationTime);
                }),
            );
        });

        it('cancelListing()', async () => {

            const ListingsToDelete = {
                VALID_1: {
                    tokenId: 1,
                    nftAddress: await nft1155.getAddress(),
                }
            }

            await marketplace
                .connect(sellerSigner)
                .cancelListing([ListingsToDelete.VALID_1]);

            const deleteListing = await marketplace.listings(
                ListingsToDelete.VALID_1.nftAddress,
                ListingsToDelete.VALID_1.tokenId,
                seller,
            );
            expect(deleteListing.quantity).to.be.equal(0);

            // reset 
            const expirationTime = 1744446500;
            const pricePerItem = ethers.parseEther("0.001");

            const ListingsToCreate = {
                VALID_1: {
                    _tokenId: 1,
                    _nftAddress: await nft1155.getAddress(),
                    _quantity: 10,
                    _pricePerItem: pricePerItem,
                    _expirationTime: expirationTime,
                    _paymentToken: await weth.getAddress(),
                },
            };
            await marketplace.connect(sellerSigner).createOrUpdateListing([ListingsToCreate.VALID_1]);
        });

        it('buyItems()', async () => {

            const pricePerItem = ethers.parseEther("0.01");
            
            const ListingsToBuy = {
                VALID_1: {
                    tokenId: 1,
                    nftAddress: await nft1155.getAddress(),
                    owner: seller,
                    quantity: 10,
                    maxPricePerItem: pricePerItem, 
                    paymentToken: await weth.getAddress(),
                    usingEth: false
                }
            }

            await (await weth.connect(buyerSigner).deposit({ value: pricePerItem })).wait();
            await (await weth.connect(buyerSigner).approve(await marketplace.getAddress(), pricePerItem)).wait();
            expect(await weth.balanceOf(buyer)).to.gte(pricePerItem);

            expect(await nft1155.balanceOf(seller, 1)).to.equal(100);

            await marketplace.connect(buyerSigner).buyItems([ListingsToBuy.VALID_1]);

            expect(await nft1155.balanceOf(seller, 1)).to.equal(90);
            expect(await nft1155.balanceOf(buyer, 1)).to.equal(10);
            
            // reset
            await nft1155.connect(buyerSigner).safeTransferFrom(buyer, seller, 1, ListingsToBuy.VALID_1.quantity, "0x");
            expect(await nft1155.balanceOf(seller, 1)).to.equal(100);
        });

        it('createOrUpdateTokenBid()', async () => {

            const expirationTime = 1744446500;
            const pricePerItem = ethers.parseEther("0.0999");

            const ListingsToBid = {
                VALID_1: {
                    _tokenId: 1,
                    _nftAddress: await nft1155.getAddress(),
                    _quantity: 10,
                    _pricePerItem: pricePerItem,
                    _expirationTime: expirationTime,
                    _paymentToken: await weth.getAddress(),
                }
            }

            const totalPrice = BigInt(ListingsToBid.VALID_1._quantity) * BigInt(pricePerItem)
            await (await weth.connect(buyerSigner).deposit({ value: totalPrice })).wait();
            await (await weth.connect(buyerSigner).approve(await marketplace.getAddress(), totalPrice)).wait();
            expect(await weth.balanceOf(buyer)).to.gte(totalPrice);

            await marketplace.connect(buyerSigner).createOrUpdateTokenBid(
                ListingsToBid.VALID_1._nftAddress,
                ListingsToBid.VALID_1._tokenId,
                ListingsToBid.VALID_1._quantity,
                ListingsToBid.VALID_1._pricePerItem,
                ListingsToBid.VALID_1._expirationTime,
                ListingsToBid.VALID_1._paymentToken,
            );

            const tokenBids = await marketplace.tokenBids(ListingsToBid.VALID_1._nftAddress, ListingsToBid.VALID_1._tokenId, buyer);
            expect(tokenBids.pricePerItem).to.be.eq(pricePerItem);

            // update 
            const newPricePerItem = ethers.parseEther("0.0911");
            ListingsToBid.VALID_1._pricePerItem = newPricePerItem;
            await marketplace.connect(buyerSigner).createOrUpdateTokenBid(
                ListingsToBid.VALID_1._nftAddress,
                ListingsToBid.VALID_1._tokenId,
                ListingsToBid.VALID_1._quantity,
                ListingsToBid.VALID_1._pricePerItem,
                ListingsToBid.VALID_1._expirationTime,
                ListingsToBid.VALID_1._paymentToken,
            );
            const updateTokenBids = await marketplace.tokenBids(ListingsToBid.VALID_1._nftAddress, ListingsToBid.VALID_1._tokenId, buyer);
            expect(updateTokenBids.pricePerItem).to.be.eq(newPricePerItem);

        });

        it('cancelBids()', async () => {

            const expirationTime = 1744446500;
            const pricePerItem = ethers.parseEther("0.0999");

            const ListingsToBid = {
                VALID_1: {
                    _tokenId: 1,
                    _nftAddress: await nft1155.getAddress(),
                    _quantity: 10,
                    _pricePerItem: pricePerItem,
                    _expirationTime: expirationTime,
                    _paymentToken: await weth.getAddress(),
                }
            }

            await marketplace.connect(buyerSigner).cancelBids([
                {
                    bidType: 0,
                    nftAddress: ListingsToBid.VALID_1._nftAddress,
                    tokenId: ListingsToBid.VALID_1._tokenId
                }
            ]);

            const tokenBids = await marketplace.connect(buyerSigner).tokenBids(ListingsToBid.VALID_1._nftAddress, ListingsToBid.VALID_1._tokenId, buyer);
            expect(tokenBids.quantity).to.be.eq(0);

            // reset
            await marketplace.connect(buyerSigner).createOrUpdateTokenBid(
                ListingsToBid.VALID_1._nftAddress,
                ListingsToBid.VALID_1._tokenId,
                ListingsToBid.VALID_1._quantity,
                ListingsToBid.VALID_1._pricePerItem,
                ListingsToBid.VALID_1._expirationTime,
                ListingsToBid.VALID_1._paymentToken,
            );
            const resetTokenBids = await marketplace.connect(buyerSigner).tokenBids(ListingsToBid.VALID_1._nftAddress, ListingsToBid.VALID_1._tokenId, buyer);
            expect(resetTokenBids.quantity).to.be.eq(10);
        });

        it('acceptTokenBid()', async () => {

            const pricePerItem = ethers.parseEther("0.0999");

            const ListingsToTakeBid = {
                VALID_1: {
                    nftAddress: await nft1155.getAddress(),
                    tokenId: 1,
                    bidder: buyer,
                    quantity: 10,
                    pricePerItem: pricePerItem,
                    paymentToken: await weth.getAddress(),
                }
            }

            await marketplace.connect(sellerSigner).acceptTokenBid(ListingsToTakeBid.VALID_1);

            expect(await nft1155.balanceOf(seller, 1)).to.equal(90);
            expect(await nft1155.balanceOf(buyer, 1)).to.equal(10);

            // reset
            await nft1155.connect(buyerSigner).safeTransferFrom(buyer, seller, 1, ListingsToTakeBid.VALID_1.quantity, "0x");
            expect(await nft1155.balanceOf(seller, 1)).to.equal(100);

        });

        it('createOrUpdateCollectionBid()', async () => {

            const expirationTime = 1744446500;
            const pricePerItem = ethers.parseEther("0.0999");

            const ListingsToCollectionBid = {
                VALID_1: {
                    _nftAddress: await nft1155.getAddress(),
                    _quantity: 10,
                    _pricePerItem: pricePerItem,
                    _expirationTime: expirationTime,
                    _paymentToken: await weth.getAddress(),
                }
            }

            await (await weth.connect(buyerSigner).deposit({ value: pricePerItem })).wait();
            await (await weth.connect(buyerSigner).approve(await marketplace.getAddress(), pricePerItem)).wait();

            await expect (
                marketplace.connect(buyerSigner).createOrUpdateCollectionBid(
                ListingsToCollectionBid.VALID_1._nftAddress,
                ListingsToCollectionBid.VALID_1._quantity,
                ListingsToCollectionBid.VALID_1._pricePerItem,
                ListingsToCollectionBid.VALID_1._expirationTime,
                ListingsToCollectionBid.VALID_1._paymentToken
            )).to.be.revertedWith("No collection bids on 1155s");

            const collectionBids = await marketplace.collectionBids(ListingsToCollectionBid.VALID_1._nftAddress, buyer);
            expect(collectionBids.quantity).to.be.eq(0);
        });
    });
});