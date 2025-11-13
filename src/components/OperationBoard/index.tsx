/* eslint-disable array-callback-return */
/* eslint-disable no-unsafe-finally */
import { useEffect, useState } from "react";
import { NumericFormat } from "react-number-format";
import { useSelector } from "react-redux";
import { ClientService } from "../../../services/client.service";
import { useSnackbar } from "notistack";
import { ApiPromise, WsProvider } from "@polkadot/api";
import { keyring as uiKeyring } from "@polkadot/ui-keyring";
import { waitReady } from "@polkadot/wasm-crypto";
import dayjs from "dayjs";
import { v4 as uuidv4 } from "uuid";
import { sha256 } from "js-sha256";

import {
  Box,
  Button,
  Card,
  FormHelperText,
  Grid,
  InputLabel,
  Typography,
} from "@mui/material";

import type { ICertificateOrg } from "../../../types/certificateOrg";

import { LoadingButton } from "@mui/lab";

import EnergyImg from "../../../assets/imgs/energy.png";
import informationIssueImg from "../../../assets/imgs/informationIssue.png";
import { colors } from "../../../styles";
import { SelectAmount } from "../../RecIssue/selectAmount";
import { SelectMode } from "../../RecIssue/selectMode";
import { RecList } from "../../RecToken/recList";
import { ConfirmationModal } from "../../../components/confirmationModal";
import { CertificatesService } from "../../../services/certificates.service";
import { EnterpriseService } from "../../../services/enterprise.service";
import { MemberService } from "../../../services/member.service";
import { TransactionService } from "../../../services/transactions.service";
import { useNavigate } from "react-router-dom";

type OriginCertOnchainType = Array<
  [string, number, string, [number, number], number]
>;

interface IRecTransfer {
  setGoTotransferT: (value: boolean) => void;
}

interface IClient {
  id: string;
  name: string;
  wallet: string;
  isActivate: string;
  country: string;
  state: string;
  city: string;
}

interface Item {
  origin_id: string;
  origin_hash: string;
  holder_wallet: string;
  amount: number;
  date: Date;
}

export const OperationBoard = ({ setGoTotransferT }: IRecTransfer) => {
  const navigate = useNavigate();
  const history = useNavigate();
  const certificatesService = new CertificatesService();
  const memberService = new MemberService();
  const enterpriseService = new EnterpriseService();

  const [user, setUser] = useState<any>({});
  const { enqueueSnackbar, closeSnackbar } = useSnackbar();
  const [enterprise, setEnterprise] = useState<any>();

  const [selectWallet, setSelectWallet] = useState<string>("");
  const [totalAvaliable, setTotalAvaliable] = useState<number>(0);
  const [showSteps, setShowSteps] = useState<boolean>(false);
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [selectedClient, setSelectedClient] = useState<IClient>();
  const [validateTotalEnergy, setValidateTotalEnergy] =
    useState<boolean>(false);
  const [inputAmount, setInputAmount] = useState<string>("");
  const [openTransferAuthorizationModal, setOpenTransferAuthorizationModal] =
    useState<boolean>(false);
  const [openRetireAuthorizationModal, setOpenRetireAuthorizationModal] =
    useState<boolean>(false);
  const [passwordAuthorization, setPasswordAuthorization] =
    useState<string>("");
  const [loadingAuthorization, setLoadingModalAuthorization] =
    useState<boolean>(false);
  const [loadingAuthorizeButton, setLoadingAuthorizeButton] =
    useState<boolean>(false);
  const [dataClients, setDataClients] = useState<IClient[]>([]);

  const getTransferRow: ICertificateOrg = useSelector(
    (state: any) => state.totalRecAvailable
  );

  const CopyGetSelectedCertificates = { ...getTransferRow };

  const getUserInfo = async () => {
    const getUser: any = await memberService.getMyInfo();
    if (getUser.status === 200) {
      setUser(getUser.data);
    }
  };

  useEffect(() => {
    getUserInfo();
  }, []);

  useEffect(() => {
    const getEnterprise = async () => {
      const response: any = await enterpriseService.listEnterprise();
      if (response.data) {
        setEnterprise(response.data);
      }
    };
    getEnterprise();
  }, []);
  useEffect(() => {
    const clientService = new ClientService();

    const getTransactions = async () => {
      const respSubmitEnt: any = await clientService.listClients();
      const output = respSubmitEnt.data.map(
        (item: {
          id: string;
          beneficiary: string;
          logo: string;
          wallet_address: string;
          is_activate: boolean;
          country: string;
          state: string;
          city: string;
        }) => ({
          id: item.id,
          name: item.beneficiary,
          logo: item.logo,
          wallet: item.wallet_address,
          isActivate: item.is_activate,
          country: item.country,
          state: item.state,
          city: item.city,
        })
      );

      setDataClients(output);
    };
    getTransactions();
  }, []);

  useEffect(() => {
    if (selectedClientId) {
      const client = dataClients.find(
        (element: any) => element.id === selectedClientId
      );
      if (client?.wallet) {
        setSelectedClient(client);
        setSelectWallet(client.wallet);
      } else {
        enqueueSnackbar("Error to select a client", {
          variant: "info",
        });
      }
    }
  }, [selectedClientId]);

  async function matTransferRec(
    toAccount: string,
    multiledgersParaId: string,
    cceeParaId: string,
    ocert: [OriginCertOnchainType],
    operationDate: string,
    recHash: string
  ) {
    try {
      await waitReady();
      uiKeyring.loadAll({ ss58Format: 42, type: "sr25519" });
    } catch (error) {
      console.log(error);
    } finally {
      const provider = new WsProvider(
        `${import.meta.env.VITE_CLIENT_PARACHAIN_ADDRESS}`
      );
      const api = await ApiPromise.create({ provider });
      try {
        const holderPair = uiKeyring.getPair(user.wallet_address);
        try {
          holderPair.unlock(passwordAuthorization);
        } catch (error) {
          console.log(error);
          enqueueSnackbar("The password of your wallet is invalid, try again", {
            variant: "error",
          });
          return;
        }
        const genesisHash = api.genesisHash;
        const runtimeVersion = api.runtimeVersion;
        const nonce = await api.rpc.system.accountNextIndex(holderPair.address);

        const multiledgersClient =
          import.meta.env.VITE_ENVIRONMENT !== "local"
            ? window.location.hostname
            : "dev-origin.multiledgers.com";

        // Criar array de transações para batch
        let tx_vec: Array<any> = [];
        for (let index = 0; index < ocert[0].length; index++) {
          // hash, amount, owner, [range, range], original_amount
          const hash = ocert[0][index][0];
          const amount = ocert[0][index][1];
          const owner = ocert[0][index][2];

          const extrinsic = api.tx.recV2.transferRecCertificateGroup(
            multiledgersClient,
            owner,
            hash,
            toAccount,
            amount
          );
          tx_vec.push(extrinsic);
        }

        const extrinsic = api.tx.utility.batch(tx_vec).sign(holderPair, {
          genesisHash,
          blockHash: genesisHash,
          nonce,
          runtimeVersion,
        });

        await api.disconnect();
        return extrinsic;
        //
      } catch (error) {
        console.log(error);
        enqueueSnackbar(
          "Wallet not found, please consider recovering it on the My Profile page. A new tab will be created in 5 seconds.",
          {
            variant: "error",
          }
        );
        setTimeout(() => {
          window.open(
            `${window.location.origin}/profile/wallet/recovery`,
            "_blank",
            "noopener,noreferrer"
          );
        }, 5000);
        return;
      }
    }
  }

  useEffect(() => {
    if (CopyGetSelectedCertificates.totalRec.length > 0) {
      const amountTotal = CopyGetSelectedCertificates.totalRec.reduce(
        (acumulador: any, objeto: any) => {
          return Number(acumulador) + Number(objeto.amountRec);
        },
        0
      );

      setTotalAvaliable(amountTotal);
    }
  }, [CopyGetSelectedCertificates]);

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { value } = event.target;

    const newValue = value.replace(/[.,]/g, "");

    if (Number(newValue) > totalAvaliable || Number(newValue) <= 0) {
      setValidateTotalEnergy(true);
    } else {
      setValidateTotalEnergy(false);
    }
    setInputAmount(newValue);
  };

  const handleCloseTransferAuthoraztion = (value: boolean) => {
    setOpenTransferAuthorizationModal(value);
  };

  const handleCloseRetirementAuthoraztion = (value: boolean) => {
    setOpenRetireAuthorizationModal(value);
  };

  const onSubmitTransfer = () => {
    if (!user.wallet_address) {
      enqueueSnackbar(
        "You haven't registered your wallet in your profile yet.",
        {
          variant: "error",
        }
      );
      return;
    }
    handleCloseTransferAuthoraztion(true);
  };

  const onSubmitRetirement = () => {
    if (!user.wallet_address) {
      enqueueSnackbar(
        "You haven't registered your wallet in your profile yet.",
        {
          variant: "error",
        }
      );
      return;
    }
    handleCloseRetirementAuthoraztion(true);
  };

  function calculeQuotient(amount: number, divisor: number) {
    const averageAmount = Math.floor(amount / divisor);
    const remainder = amount % divisor;
    return { averageAmount, remainder };
  }

  function calculateList(list: Item[], final_amount: number): Item[] {
    const listLength = list.length;
    const { averageAmount, remainder } = calculeQuotient(
      final_amount,
      listLength
    );
    const orderedList = list.sort(
      (a, b) => a.date.getTime() - b.date.getTime()
    );
    const certValues = new Array<number>(orderedList.length);
    const remainerValues = new Array<number>(orderedList.length).fill(0);
    remainerValues[0] = remainder;
    orderedList.map((item, index) => {
      certValues[index] = item.amount;
      remainerValues[index] =
        item.amount - averageAmount - remainerValues[index];
    });
    while (remainerValues.some((v) => v < 0)) {
      for (let i = 0; i < remainerValues.length; i++) {
        if (remainerValues[i] < 0) {
          for (let j = 0; j < remainerValues.length; j++) {
            if (remainerValues[j] > 0) {
              const amountntnt = remainerValues[j] + remainerValues[i];
              if (amountntnt <= 0) {
                remainerValues[j] = 0;
                remainerValues[i] = amountntnt;
              } else {
                remainerValues[i] = 0;
                remainerValues[j] = amountntnt;
                break;
              }
            }
          }
        }
      }
    }
    const finalll = certValues.map((item, index) => {
      return item - remainerValues[index];
    });
    const newList = orderedList.map((item, index) => {
      return { ...item, amount: finalll[index] };
    });
    return newList;
  }

  const onSubmitTransferAuthorization = async () => {
    if (!CopyGetSelectedCertificates.totalRec) return;

    setLoadingAuthorizeButton(true);
    setLoadingModalAuthorization(true);

    const output: Item[] = CopyGetSelectedCertificates.totalRec.map(
      (item: ICertificateOrg) => ({
        origin_id: item.id,
        origin_hash: item.recHash,
        ...(user?.role === "owner" && {
          holder_wallet: item.beneficiaryWallet,
        }),
        amount: Number(item.amountRec),
        date: item.startDate,
      })
    );

    const originCertificate = calculateList(output, Number(inputAmount));
    console.log("originCertificate", originCertificate);

    const orderedList = CopyGetSelectedCertificates.totalRec.sort(
      (a: any, b: any) => a.startDate.getTime() - b.startDate.getTime()
    );

    const [paramsCert] = orderedList;
    const newStartDate = paramsCert.startDate;
    const newEndDate = orderedList[orderedList.length - 1].endDate;

    // ONCHAIN
    const dateFormatted = dayjs().format("YYYY-MM-DD");
    const onchainOrigin: OriginCertOnchainType = originCertificate.map(
      (item) => {
        return [
          item.origin_hash,
          item.amount,
          user?.role === "owner" ? item.holder_wallet : user?.wallet_address,
          [0, 0],
          0,
        ];
      }
    );
    const RecCertId = `0x${sha256.update(uuidv4()).hex()}`;

    const signedTransaction = await matTransferRec(
      selectWallet,
      `${import.meta.env.VITE_CLIENT_PARACHAIN_ID}`,
      `${import.meta.env.VITE_CLIENT_PARACHAIN_ID}`,
      [onchainOrigin],
      dateFormatted,
      RecCertId
    );

    if (!signedTransaction) {
      enqueueSnackbar("Wallet Signature problem", {
        variant: "error",
      });
      setLoadingModalAuthorization(false);
      return;
    }
    if (!selectedClient) {
      return;
    }

    const notify = enqueueSnackbar("Processing on the blockchain.", {
      variant: "info",
      persist: true,
    });

    handleCloseTransferAuthoraztion(false);
    setLoadingModalAuthorization(false);

    const respCertificate = await certificatesService.createTransferRec({
      enterprise_id: paramsCert.enterpriseId,
      asset_id: paramsCert.assetId,
      rec_id: paramsCert.recId,
      start_date: newStartDate,
      end_date: newEndDate,
      operation_type: "transfer",
      origins: originCertificate,
      from: paramsCert.to,
      rec_hash: RecCertId,
      to: selectedClient.id,
      holder_wallet: selectedClient.wallet,
      extrinsic: signedTransaction,
    });

    if ([400, 401, 403, 404, 500].includes(respCertificate.status)) {
      closeSnackbar(notify);
      enqueueSnackbar(respCertificate.statusText, {
        variant: "error",
      });
      setLoadingAuthorizeButton(false);
      setLoadingModalAuthorization(false);
    }
    if (respCertificate.status === 200) {
      closeSnackbar(notify);
      enqueueSnackbar("Certificate sent successfully", {
        variant: "success",
      });
      setLoadingModalAuthorization(false);
      user?.role === "owner"
        ? navigate(-1)
        : setTimeout(() => {
            location.reload();
          }, 1000);
    }
  };

  async function retireREC(
    ocert: [OriginCertOnchainType],
    operationDate: string,
    beneficiary: string,
    clientAddress: string,
    recHash: string
  ) {
    try {
      await waitReady();
      uiKeyring.loadAll({ ss58Format: 42, type: "sr25519" });
    } catch (error) {
      console.log(error);
    } finally {
      const provider = new WsProvider(
        `${import.meta.env.VITE_CLIENT_PARACHAIN_ADDRESS}`
      );
      const api = await ApiPromise.create({ provider });
      try {
        const userPair = uiKeyring.getPair(user.wallet_address);
        try {
          userPair.unlock(passwordAuthorization);
        } catch (error) {
          console.log(error);
          enqueueSnackbar("The password of your wallet is invalid, try again", {
            variant: "error",
          });
          setLoadingModalAuthorization(false);
          return;
        }
        const genesisHash = api.genesisHash;
        const runtimeVersion = api.runtimeVersion;
        const nonce = await api.rpc.system.accountNextIndex(userPair.address);

        const multiledgersClient =
          import.meta.env.VITE_ENVIRONMENT !== "local"
            ? window.location.hostname
            : "dev-origin.multiledgers.com";

        // Criar array de transações para batch
        let tx_vec: Array<any> = [];
        for (let index = 0; index < ocert[0].length; index++) {
          // hash, amount, owner, [range, range], original_amount
          const hash = ocert[0][index][0];
          const amount = ocert[0][index][1];
          const owner = ocert[0][index][2];

          const extrinsic = api.tx.recV2.retireRecCertificateGroup(
            multiledgersClient,
            owner,
            hash,
            beneficiary,
            clientAddress,
            amount
          );
          tx_vec.push(extrinsic);
        }

        const extrinsic = api.tx.utility.batch(tx_vec).sign(userPair, {
          genesisHash,
          blockHash: genesisHash,
          nonce,
          runtimeVersion,
        });

        await api.disconnect();
        return extrinsic;
        //
      } catch (error) {
        console.log(error);
        enqueueSnackbar(
          "Wallet not found, please consider recovering it on the My Profile page. A new tab will be created in 5 seconds.",
          {
            variant: "error",
          }
        );
        setLoadingModalAuthorization(false);
        setTimeout(() => {
          window.open(
            `${window.location.origin}/profile/wallet/recovery`,
            "_blank",
            "noopener,noreferrer"
          );
        }, 5000);
        return;
      }
    }
  }

  const onSubmitRetirementAuthorization = async () => {
    const transactionService = new TransactionService();

    if (!CopyGetSelectedCertificates.totalRec) return;

    setLoadingAuthorizeButton(true);
    setLoadingModalAuthorization(true);

    const output: Item[] = CopyGetSelectedCertificates.totalRec.map(
      (item: ICertificateOrg) => ({
        origin_id: item.id,
        origin_hash: item.recHash,
        ...(user?.role === "owner" && {
          holder_wallet: item.beneficiaryWallet,
        }),
        amount: Number(item.amountRec),
        date: item.startDate,
      })
    );

    const originCertificate = calculateList(output, Number(inputAmount));

    const orderedList = CopyGetSelectedCertificates.totalRec.sort(
      (a: any, b: any) => a.startDate.getTime() - b.startDate.getTime()
    );

    const [paramsCert] = orderedList;
    const newStartDate = paramsCert.startDate;
    const newEndDate = orderedList[orderedList.length - 1].endDate;

    // ONCHAIN
    const dateFormatted = dayjs().format("YYYY-MM-DD");
    const onchainOrigin: OriginCertOnchainType = originCertificate.map(
      (item) => {
        return [
          item.origin_hash,
          item.amount,
          user?.role === "owner" ? item.holder_wallet : user?.wallet_address,
          [0, 0],
          0,
        ];
      }
    );

    const RecCertId = `0x${sha256.update(uuidv4()).hex()}`;

    const consumptionAddress = `${selectedClient?.country} - ${selectedClient?.state} - ${selectedClient?.city}`;

    const signedTransaction = await retireREC(
      [onchainOrigin],
      dateFormatted,
      selectWallet,
      consumptionAddress,
      RecCertId
    );

    if (!signedTransaction) {
      enqueueSnackbar("Wallet Signature problem", {
        variant: "error",
      });
      setLoadingModalAuthorization(false);
      return;
    }
    if (!selectedClient) {
      return;
    }

    const notify = enqueueSnackbar("Processing on the blockchain.", {
      variant: "info",
      persist: true,
    });

    handleCloseRetirementAuthoraztion(false);
    setLoadingModalAuthorization(false);

    const createRetirementData = {
      asset_id: paramsCert.assetId,
      client_id: selectedClient?.id,
      rec_id: paramsCert.recId,
      start_date: newStartDate,
      end_date: newEndDate,
      operation_type: "retirement",
      origins: originCertificate,
      enterprise_id: paramsCert.enterpriseId,
      rec_hash: RecCertId,
      holder_wallet: selectedClient?.wallet,
      extrinsic: signedTransaction,
    };

    const respCertificate = await transactionService.createRetirement(
      createRetirementData
    );
    if ([400, 401, 403, 404, 500].includes(respCertificate.status)) {
      enqueueSnackbar(respCertificate.statusText, {
        variant: "error",
      });
      closeSnackbar(notify);
    }
    if (respCertificate.status === 200) {
      closeSnackbar(notify);
      enqueueSnackbar("Certificate sent successfully", {
        variant: "success",
      });
      setOpenRetireAuthorizationModal(false);
      setLoadingModalAuthorization(false);

      user?.role === "owner"
        ? navigate(-1)
        : setTimeout(() => {
            location.reload();
          }, 1000);
    }
  };

  const TITLE =
    user?.role === "owner" ? "Customer Operation" : "operation board";

  return (
    <>
      {/* <Box position="absolute" bottom="0" width="35%" left="152px">
				<img src={RecIssueImg} alt="backgroundimage"></img>
			</Box> */}
      <Grid container md={12} marginBottom="54px">
        <Grid item md={12} display="flex">
          <Button
            variant="outlined"
            onClick={() =>
              user?.role === "owner" ? navigate(-1) : setGoTotransferT(false)
            }
            sx={{
              width: "107px",
              height: "40px",
              borderRadius: "25px",
              border: "1px solid #000",
              padding: "8px 24px",
              color: "#000",
              textTransform: "initial",
              fontSize: "1.25rem",
              "&:hover": {
                border: "1px solid #000",
              },
            }}
          >
            <Typography fontSize="1.25rem" lineHeight="32px">
              Back
            </Typography>
          </Button>
          <Typography
            fontWeight="700"
            fontSize="1.75rem"
            lineHeight="40px"
            color={colors.primary}
            marginBottom="9px"
            marginLeft="96px"
            textTransform="uppercase"
          >
            {TITLE}
          </Typography>
        </Grid>
      </Grid>

      <Grid container md={12} gap={5}>
        <Grid item md={4}>
          <Card sx={{ marginLeft: "25px" }}>
            <Box display="flex" alignItems="center">
              <SelectMode />
              <Typography sx={{ marginLeft: "21px", fontSize: "1.25rem" }}>
                SELECT A CUSTOMER
              </Typography>
            </Box>

            <Box marginTop="40px">
              {dataClients && (
                <RecList
                  dataClients={dataClients}
                  setShowSteps={setShowSteps}
                  setSelectedClientId={setSelectedClientId}
                />
              )}
            </Box>
          </Card>
        </Grid>
        {showSteps && (
          <Grid item md={4}>
            <Card sx={{ height: "600px", position: "relative" }}>
              <Box display="flex" alignItems="center">
                <SelectAmount step={2} />
                <Typography sx={{ marginLeft: "21px", fontSize: "1.25rem" }}>
                  INSERT AMOUNT:
                </Typography>
              </Box>
              <Card sx={{ marginTop: "57px" }}>
                <Box marginLeft="100px">
                  <Typography fontSize="1.25rem">
                    TOTAL AVAILABLE RECs
                  </Typography>
                </Box>
                <Box
                  display="flex"
                  alignItems="center"
                  marginLeft="29px"
                  marginBottom="48px"
                >
                  <img src={EnergyImg} alt="eletric"></img>
                  <Typography
                    sx={{
                      marginLeft: "23px",
                      fontSize: "2.25rem",
                      fontWeight: "700",
                      color: "#00CA95",
                    }}
                  >
                    {Number(totalAvaliable).toLocaleString("en-US", {
                      minimumFractionDigits: 0,
                    })}
                  </Typography>
                </Box>

                <Box marginLeft="40px">
                  <InputLabel
                    error={false}
                    shrink
                    htmlFor="job_title"
                    sx={{
                      color: colors.neutralDark,
                      fontSize: "25px",
                      lineHeight: "32px",
                    }}
                  >
                    Enter the amount of RECs to operate
                  </InputLabel>
                  <NumericFormat
                    value={Number(inputAmount)}
                    allowLeadingZeros
                    decimalSeparator="."
                    thousandSeparator=","
                    placeholder="0"
                    allowNegative={false}
                    decimalScale={0}
                    style={{
                      width: "298px",
                      outline: validateTotalEnergy ? "blue" : "#F32053",
                      padding: "16px 14px",
                      border: `1px solid ${
                        validateTotalEnergy ? "#F32053" : "#3A4049"
                      }`,
                      boxShadow: "0px 2px 8px rgb(0 0 0 / 15%)",
                      borderRadius: "9px",
                      marginTop: "8px",
                      fontSize: "30px",
                      color: validateTotalEnergy
                        ? "#F32053"
                        : colors.neutralDark,
                    }}
                    onChange={handleInputChange}
                  />
                  {validateTotalEnergy && (
                    <FormHelperText
                      error
                      sx={{
                        fontWeight: "700",
                        fontSize: "14px",
                        lineHeight: "32px",
                        fontFamily: "sen",
                        "&.Mui-error": {
                          color: "#F32053",
                        },
                      }}
                    >
                      UNAVAILABLE AMOUNT
                    </FormHelperText>
                  )}
                </Box>
              </Card>
            </Card>
          </Grid>
        )}
        {showSteps && (
          <Grid item md={3}>
            <Card>
              <Box display="flex" alignItems="center">
                <SelectAmount step={3} />
                <Typography sx={{ marginLeft: "21px", fontSize: "1.25rem" }}>
                  FINALIZE:
                </Typography>
              </Box>
              <Card sx={{ marginTop: "57px" }}>
                <Box
                  display="flex"
                  alignItems="center"
                  marginLeft="35px"
                  marginBottom="18px"
                >
                  <Box marginTop="5px">
                    <img src={informationIssueImg}></img>
                  </Box>
                  <Typography
                    sx={{
                      color: colors.supportDark,
                      fontSize: "20px",
                      marginLeft: "17px",
                    }}
                  >
                    Important:
                  </Typography>
                </Box>
                <Box marginLeft="35px">
                  <Typography
                    color={colors.neutralDark}
                    fontSize="20px"
                    lineHeight="32px"
                  >
                    This operation is conditioned to the available amount of
                    tokens in your wallet
                  </Typography>
                </Box>

                <LoadingButton
                  disableElevation
                  disabled={validateTotalEnergy}
                  loading={loadingAuthorizeButton}
                  onClick={onSubmitTransfer}
                  sx={{
                    marginLeft: "35px",
                    marginTop: "65px",
                    width: "242px",
                    borderRadius: "25px",
                    padding: "8px 32px",
                    display: "flex",
                    alignItems: "flex-end",
                    backgroundColor:
                      !validateTotalEnergy &&
                      inputAmount &&
                      !loadingAuthorizeButton
                        ? colors.primary
                        : colors.primaryLight,
                    "&:hover": {
                      backgroundColor:
                        !validateTotalEnergy &&
                        inputAmount &&
                        !loadingAuthorizeButton
                          ? colors.primary
                          : colors.primaryLight,
                    },
                  }}
                >
                  <Typography
                    color="#fff"
                    fontSize="24px"
                    fontWeight="700"
                    lineHeight="32px"
                  >
                    TRANSFER
                  </Typography>
                </LoadingButton>

                <LoadingButton
                  disableElevation
                  disabled={validateTotalEnergy}
                  loading={loadingAuthorizeButton}
                  onClick={onSubmitRetirement}
                  sx={{
                    marginLeft: "35px",
                    marginTop: "65px",
                    width: "242px",
                    borderRadius: "25px",
                    padding: "8px 32px",
                    display: "flex",
                    alignItems: "flex-end",
                    backgroundColor:
                      !validateTotalEnergy &&
                      inputAmount &&
                      !loadingAuthorizeButton
                        ? colors.primary
                        : colors.primaryLight,
                    "&:hover": {
                      backgroundColor:
                        !validateTotalEnergy &&
                        inputAmount &&
                        !loadingAuthorizeButton
                          ? colors.primary
                          : colors.primaryLight,
                    },
                  }}
                >
                  <Typography
                    color="#fff"
                    fontSize="24px"
                    fontWeight="700"
                    lineHeight="32px"
                  >
                    RETIRE
                  </Typography>
                </LoadingButton>
              </Card>
            </Card>
          </Grid>
        )}
        {openTransferAuthorizationModal && (
          <ConfirmationModal
            open={openTransferAuthorizationModal}
            title="Transfer of RECs"
            subTitle="This action will prompt you to authorize the transfer of RECs."
            walletName={user.wallet_name}
            walletAddress={user.wallet_address}
            handleCloseAuthorization={() => {
              handleCloseTransferAuthoraztion(false);
            }}
            onSubmitAuthorization={onSubmitTransferAuthorization}
            setPasswordAuthorization={setPasswordAuthorization}
            loadingAuthorization={loadingAuthorization}
            confirm="Sign"
            cancel="Cancel"
          />
        )}
        {openRetireAuthorizationModal && (
          <ConfirmationModal
            open={openRetireAuthorizationModal}
            title="Retirement of RECs"
            subTitle="This action will prompt you to authorize the retirement of RECs."
            walletName={user.wallet_name}
            walletAddress={user.wallet_address}
            handleCloseAuthorization={() => {
              handleCloseRetirementAuthoraztion(false);
            }}
            onSubmitAuthorization={onSubmitRetirementAuthorization}
            setPasswordAuthorization={setPasswordAuthorization}
            loadingAuthorization={loadingAuthorization}
            confirm="Sign"
            cancel="Cancel"
          />
        )}
      </Grid>
    </>
  );
};
